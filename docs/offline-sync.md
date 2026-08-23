# Offline Sync Design Note

Status: implemented, Phase 6. See `docs/adr/0008-phase-6-offline-sync.md` for
the migration-history repair recorded alongside this phase, and
`docs/REQUIREMENTS_TRACEABILITY.md` §3.10 for the FR-OFF/NFR-OFF-adjacent
traceability rows. This note covers the design; the ADR covers the
decisions and their rationale.

## Scope

Offline entry is supported for exactly the four `client_uuid`-bearing
tables (CLAUDE.md §14, DR-05): Daily Expenses, Monthly Expenses, Party
Income (daily grid cells, direct cash receipts, and monthly party bills),
and Counter Income. Assets, Capital Contributions, the Audit Log, master
data, users/settings, and reports/exports are never offline-capable —
reports/exports in particular always require a live connection (FR-OFF-13),
by construction (nothing caches them).

## The queue (client-side)

`src/lib/offline/`:

- **`db.ts`** — one Dexie (IndexedDB) database per signed-in user id
  (`cdc-offline-<userId>`), opened/closed only when the user id actually
  changes. A different user signing in on the same device always gets a
  fresh, separate database.
- **`types.ts`** — `QueuedOperation`: `operationId` (client-generated UUID,
  the Dexie primary key) identifies the _operation_; `clientUuid` identifies
  the underlying _record_. A `[entityType+clientUuid]` compound index finds
  every operation queued against one logical record.
- **`coalesce.ts`** — five deterministic rules, applied only while an
  operation is still queued and has never reached the wire:
  1. CREATE + later UPDATE(s) → one CREATE with the latest values, original
     capture time preserved.
  2. CREATE + later ARCHIVE → both discarded; nothing is ever sent.
  3. UPDATE + later UPDATE → one UPDATE, keeping the _original_
     `expectedUpdatedAt`.
  4. UPDATE + later ARCHIVE → collapses to ARCHIVE alone, original
     `expectedUpdatedAt` kept.
  5. An operation already `SYNCING` is never touched — a later edit queues
     as a new, separate operation.
- **`queue.ts`** — `enqueueOperation` (applies the rules above),
  `listOperationsDueForSync`, and the status-transition helpers
  (`markSyncing`/`markSynced`/`markFailed`/`markConflict`,
  `resolveConflictKeepLocal`/`resolveConflictKeepServer`, `retryNow`).
- **`backoff.ts`** — up to 5 automatic attempts, exponential backoff with
  full jitter, base 2s, capped at 30s.
- **`fingerprint.ts`** — SHA-256 over deterministic canonical JSON (sorted
  object keys, `undefined` handled like `JSON.stringify`), computed over
  `{entityType, action, clientUuid, payload}`. Used identically client- and
  server-side; the wire protocol does not actually transmit a client-
  computed fingerprint — the server always recomputes it from the content
  it received (see below).
- **`reference-cache.ts`** — read-only Dexie tables for parties, partner
  users, expense items, expense categories, and vendors (active rows only,
  refreshed wholesale from `/api/sync/reference` on sign-in and after every
  successful sync), plus `recentRecords` (the last synced rows per entity,
  pruned past 90 days — FR-OFF-14).
- **`sync-engine.ts`** — `runSync`: verifies a real authenticated
  connection first (`ping.ts`, below), then uploads everything due in
  batches of ≤50, applying each result to the local queue.
- **`ping.ts`** — `verifyAuthenticatedConnection`: `HEAD /api/sync/ping`,
  3-second timeout, one retry. Never the public `/api/health` route (proves
  reachability, not authentication) and never bare `navigator.onLine`.

## The React layer

`src/components/offline/OfflineProvider.tsx` is the one place queue and
connection state live, and the one place sync attempts are triggered —
mounted once per signed-in user at the authenticated shell. It:

- Registers the service worker (enhancement only).
- Reads `navigator.onLine` via `useSyncExternalStore` (never a
  `useState` initializer reading it synchronously — that mismatches the
  server-rendered markup whenever the browser is genuinely offline at
  mount).
- Triggers `runSync` on: startup, `focus`, `visibilitychange`, the `online`
  event, and the service worker's `BACKGROUND_SYNC_HINT` message.
- Warns via `beforeunload` when anything is pending/failed/conflicted
  (FR-OFF-10), independent of `UserMenu.tsx`'s explicit sign-out
  confirmation (FR-AUTH-09) — signing out never erases the queue either
  way; both are heads-ups, not destructive-action prompts.

`SyncStatusIndicator.tsx` is the one FR-OFF-03 header indicator, present on
every authenticated screen. `SyncCenter.tsx` (`/sync-center`) lists the
queue and, for a `CONFLICT`, shows the approved Local/Server split-
comparison layout (re-implemented from `docs/ui/stitch-export/
offline_sync_center_code.html`'s pattern — never that file's own
Calibration/Next-Due-Date demo content, which was never a real SRS concept;
see `docs/UI_REQUIREMENTS.md` §25 decision 2c) with Keep Local/Keep Server
actions.

Every offline-aware entry form (`src/components/entries/*`) tries its
ordinary Server Action first; only a connectivity-shaped failure
(`src/lib/offline/submit-helpers.ts`'s `isLikelyOfflineError` — a fetch
`TypeError`, or `navigator.onLine` already false) falls back to
`enqueue(...)`. Any other failure (validation, permission, a genuine server
error) is shown exactly as it would be online.

## The server side

- **`sync_operations`** (migration `20260822070612_phase6_offline_sync`) —
  one durable receipt per operation ever accepted/applied/conflicted/
  rejected: `operation_id` (PK), `actor_user_id`, `entity_type`,
  `client_uuid`, `action`, `request_fingerprint`, `status`, `result_body`
  (JSONB, replayed verbatim), `created_at`. Not covered by the physical-
  deletion-rejection triggers (infrastructure, like `sessions`/`account`/
  `verification` from Phase 2) — see retention below.
- **`POST /api/sync/upload`** (`src/server/sync/upload.ts` is the testable
  core; the route only authenticates/parses) — each operation runs inside
  its own single transaction: look up an existing receipt by
  `operationId` first — not found → run the mutation, its audit row, and
  the new receipt together; found with a matching fingerprint → replay
  `result_body` verbatim, never re-running the mutation or a second audit
  write; found with a _different_ fingerprint → reject as
  `OPERATION_ID_REUSED`. Every mutation function
  (`src/server/mutations/*.ts`) accepts an optional trailing
  `tx?: Prisma.TransactionClient`, defaulting to opening its own
  transaction when omitted — this is what makes true atomicity possible
  without touching any existing online call site.
- **`src/server/sync/apply.ts`** routes each operation to the right
  mutation by `entityType`/`action`, and distinguishes a genuine version
  **conflict** from an ordinary **rejection** by re-reading the current row
  inside the same transaction: if its `updatedAt` differs from the
  operation's `expectedUpdatedAt`, that's a `CONFLICT`
  (`{current, currentVersion}`); otherwise it's a plain `REJECTED` business
  error. Party Income is split into three sync entity types
  (`party_income_daily`/`party_income_cash_receipt`/
  `party_income_monthly_bill`) purely for routing — they share one table
  but different mutation functions and permission checks.
- **`HEAD /api/sync/ping`** — authenticated, fast, no body.
- **`GET /api/sync/reference`** — the reference-cache snapshot.
- **Retention** (`src/server/sync/retention.ts`) — receipts older than 180
  days may be cleaned up (`cleanupExpiredSyncReceipts`, Admin-only); never
  a blind TTL that could remove a receipt while a client might still
  legitimately retry against it (a device can stay offline far longer than
  any HTTP round trip, so the window is generous). A plain callable
  function meant to be run periodically once a scheduler exists — not
  wired into a cron this deployment doesn't have.
- **`capturedAt`/`syncedAt`** — one server timestamp serves both on an
  online create with no distinct client capture time; an offline upload
  preserves the device's own `capturedAt` and sets `syncedAt` only at
  server acceptance. Historical (pre-Phase-6) rows were backfilled
  (`synced_at = captured_at`) in the same migration — `audit_log` was
  deliberately excluded from that backfill, since its append-only trigger
  correctly rejects any `UPDATE`.

## The service worker

`public/sw.js` — static, hand-written, no bundler/Workbox dependency.
Versioned cache name (`cdc-static-<version>`); `activate` deletes every
differently-versioned cache this worker owns. Caches only a narrow,
explicit allowlist of genuinely static assets (`/_next/static/`, fonts,
icons, the manifest) plus two dedicated pages precached at `install` time:
the plain `/offline` fallback, and `/offline-entry` (the Offline Entry
Workspace — see below), served as the fallback for a failed navigation in
that order of preference — never anything under `/api/`, and never any
other page's server-rendered HTML (every other page carries live financial
data).
Background Sync (the `sync` event) is registered strictly as an
enhancement: it only posts `BACKGROUND_SYNC_HINT` to open tabs, suggesting
they attempt a sync — it is never the dependable path, since this worker
has no Dexie/TypeScript runtime to actually perform an upload and browser
support for the API is inconsistent. `OfflineProvider`'s own
startup/focus/visibilitychange/online listeners are what actually drive
every real sync attempt.

## Reopening the installed app with zero connectivity

Every authenticated screen (Daily Expenses, Counter Income, Party Income,
Monthly Expenses included) is a per-request, authenticated Server
Component — its React Server Component payload requires a live request, an
inherent Next.js App Router constraint no service worker can route around
without caching authenticated/financial data, which mandatory decision #6
forbids outright. Rather than leaving a cold reopen at the dead end this
implies, `src/app/offline-entry/page.tsx` is a genuinely static,
unauthenticated page — no session check, no Prisma call, no financial data
of any kind, safe to precache exactly like `/offline` and `/sign-in` — that
hosts all four offline entry workflows (`OfflineEntryWorkspace.tsx`) itself,
reading only this device's own already-cached reference data (parties,
expense items/categories) and queuing through the same `enqueueOperation`
every other entry form uses. `public/sw.js`'s `install` handler precaches
this page's HTML, and its `fetch` handler serves it — not the plain
`/offline` page — as the fallback for _any_ failed navigation, so reopening
the installed app offline and landing on, say, `/daily-expenses` still
reaches a page the user can actually act on. The Sidebar links to it too
(`src/lib/navigation/nav-items.ts`), so ordinary use visits it at least
once, and `src/lib/offline/last-user.ts` remembers which signed-in user's
IndexedDB to write into when there is no live session to ask — a
non-secret breadcrumb, never a credential.

**A disclosed residual case**: the workspace's own client-side JS bundle
(a separate, content-hashed `/_next/static/...` chunk) is deliberately
_not_ eagerly precached — only its HTML is (see `public/sw.js`'s own
comment on this). Next.js shares almost all of that JS across every route
(the React/Next runtime itself), so in the realistic case — a signed-in
user who has loaded _any_ authenticated page at least once, which is true
before anyone could need this workspace offline in the first place — it is
already cached by the ordinary static-asset handler below. Eagerly
fetching and caching every chunk the page references at install time was
implemented and then reverted: in `next dev` those chunks are large and
unminified (a real production build's equivalent cost is much smaller,
paid once per real device rather than once per automated test), and doing
it on every fresh service-worker registration measurably destabilized this
project's own Playwright suite without being required to satisfy the
requirement — reaching the workspace itself, which the HTML-only precache
already guarantees on its own (proven directly: `tests/e2e/offline-sync.spec.ts`'s
"reopening the app with zero connectivity" test never goes online at all
before checking the workspace is reachable). Full interactivity on a
_genuinely first-ever_ offline visit to this one specific page — before
the user has ever loaded any other authenticated page on this device — is
the only case not covered, and is proven separately, and does work, once
the user has been online at least once (`tests/e2e/offline-sync.spec.ts`'s
"records all four entry types with zero connectivity" test).

Aside from that one page, client-side navigation to an
_already-visited/prefetched_ page still works fine offline; navigating to
a not-yet-prefetched dynamic route while genuinely offline still cannot
complete, for the reason above. This does not affect FR-OFF's actual scope
beyond the workspace itself (offline _data entry_, not full offline app
navigation): the page a user is already on keeps working, and the queue
survives regardless of navigation.

## FR-OFF-12: provisional totals

`src/lib/offline/relevance.ts`'s `operationsAffectingRange` is the one
place that decides whether a still-queued operation (any status other than
synced — a synced one is deleted from the queue entirely, see `markSynced`
in `queue.ts`) could change the totals a results screen is currently
showing: a daily-dated entity (`daily_expense`, `counter_income`,
`party_income_daily`, `party_income_cash_receipt`) matches on its own date;
a `periodMonth`-dated entity (`monthly_expense`,
`party_income_monthly_bill`) expands to its whole calendar month. The
Partner Dashboard and Monthly Summary each wrap their total tiles in
`ProvisionalTotalsWrapper` (a dashed amber ring + a small "Provisional"
corner label, added only when something actually overlaps) and render
`ProvisionalNotice` (a plain-language banner naming how many entries and
what happens next) directly above them — both client components, reading
the _same_ device-local queue every other offline UI reads, never a
second, parallel source of truth. Confirmed, server-computed figures never
change underneath; only whether this device thinks they might still move
is ever shown.

## NFR-SEC-09: offline data cleared on sign-out

"Data held on a device for offline use shall be cleared on sign-out, once
no entries are waiting to upload" is deliberately a sign-out-time action,
not something that runs mid-session: the reference cache and
`recentRecords` exist specifically to support FR-OFF-14 (90 days readable
offline) _while the user keeps using this device_, so wiping them the
moment the queue happens to empty — while still signed in — would defeat
that requirement for no security benefit. `src/lib/offline/cleanup.ts`'s
`clearOfflineDataIfQueueEmpty` re-checks the actual current `operations`
count directly against IndexedDB (never a possibly-stale React render)
and, only when it is genuinely zero, deletes the entire per-user database
via `deleteOfflineDatabase` (`db.ts`) — reference cache, `recentRecords`,
and `operations` together. `UserMenu.tsx`'s sign-out button calls this
unconditionally after every successful sign-out; it is the re-check inside
the function itself, not the caller, that guarantees a "Sign out anyway"
choice with something still queued never triggers a deletion. Both
directions are proven in `tests/e2e/offline-sync.spec.ts`, by inspecting
the real IndexedDB database directly (never through Dexie, so the checks
are independent of the code they're verifying).
