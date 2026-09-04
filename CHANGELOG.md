# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Fixed — CI type check/lint failing on a fresh checkout (`generated/prisma` unresolved)

`.github/workflows/ci.yml`'s "Type check" and "Lint" steps ran _before_
"Generate Prisma Client" — a step-order bug present since Phase 1,
reproduced directly (`rm -rf generated && npx tsc --noEmit` fails with
`Cannot find module '../generated/prisma/client'` plus ~40 cascading
`implicit any` errors everywhere a Prisma query result's type could no
longer be inferred; `npx prisma generate` alone, with no other change,
made every one of those errors disappear). The schema's custom-output
generator (`output = "../generated/prisma"`) is never produced by any
`npm ci` postinstall hook — unlike the classic default-output
`@prisma/client` package, generating it is a step this project must
always run itself, and it must run before anything that resolves types
from it. `ci.yml` now generates the client immediately after installing
dependencies, before type check, lint, format check, or either Prisma
schema check. (`.github/workflows/deploy-production.yml` already had the
correct order — this only affected the pre-existing `ci.yml`.) Verified:
a fresh `rm -rf generated && npx prisma generate` followed by
typecheck/lint/format/`prisma validate`/schema-format-drift/the complete
Vitest suite (619/619) all pass cleanly in the corrected order.

### Fixed — Vercel build failure (`next-server.js.nft.json` ENOENT)

The first real `vercel build` run failed during Vercel's own packaging
step: `ENOENT: .../.next/next-server.js.nft.json`. Root cause:
`output: "standalone"` (added for the Docker image) changes how Next
emits that trace manifest, and `vercel build` reads it directly — a
confirmed, version-matching known incompatibility
(`vercel/next.js#43654`). `next.config.ts` now sets
`output: process.env.VERCEL ? undefined : "standalone"` — `VERCEL` is a
system env var Vercel sets automatically in every build (including
`vercel build` CLI runs), so standalone output now applies only to local
builds and the Docker builder stage, never a Vercel build. Verified
directly both ways: `VERCEL=1 npm run build` produces
`.next/next-server.js.nft.json` and no `.next/standalone`; a plain build
produces `.next/standalone` exactly as before. See
`docs/adr/0013-production-deployment-vercel-supabase.md` decision 2
(corrected in place).

### Added — Production Deployment Automation (Vercel + Supabase + GitHub Actions)

See `docs/adr/0013-production-deployment-vercel-supabase.md` and
`docs/VERCEL_SUPABASE_DEPLOYMENT.md`. **No deployment has been performed
and no external account or resource has been created** — this is
automation and configuration only.

- `Dockerfile`, `.dockerignore`, `compose.yaml`: production-shaped,
  non-root, multi-stage Docker image for reproducible local execution and
  CI build validation only — Vercel does not run this image; the app is
  deployed through the official Vercel CLI. Includes a `HEALTHCHECK`
  against the existing `/api/health` route.
- `next.config.ts`: added `output: "standalone"` for the Docker image;
  compatible with, and unused by, Vercel's own build pipeline.
- `prisma.config.ts`: CLI/migration commands now prefer `DIRECT_URL`
  (Supabase's direct connection, needed for `prisma migrate deploy`),
  falling back to `DATABASE_URL` unchanged locally/in CI. The running
  application (`src/server/prisma.ts`) is unaffected — it always uses
  `DATABASE_URL` (Supabase's pooled connection in production) directly.
- `prisma/client.ts` / `src/server/prisma.ts`: optional
  `DATABASE_POOL_MAX` env var bounds each instance's connection pool
  (parsed by a new pure, unit-tested `src/lib/db/pool-config.ts`) —
  unset changes nothing.
- `.github/workflows/deploy-production.yml`: new workflow, triggered on
  push to `main` and manual `workflow_dispatch`. Re-validates
  (typecheck/lint/format/complete Vitest suite/Prisma validate), builds
  and validates the Docker image, applies committed migrations to
  Supabase, then builds and deploys through the pinned official Vercel
  CLI (`vercel@59.11.2`). Single-flight via a concurrency group (a newer
  push cancels an older in-flight deploy, never the reverse); minimum
  `contents: read` permission; uses a `production` GitHub Environment.
  Never runs the full Playwright suite (unchanged `ci.yml` already gates
  every push/PR with that).
- `.env.example`: documented `DIRECT_URL` and `DATABASE_POOL_MAX`.
- `docs/deployment.md`: filled in the previously-`[8B]` provider,
  routine-deployment, and backup sections now that Vercel/Supabase are
  chosen; flagged two real platform constraints rather than silently
  working around them — Vercel's fixed 4.5 MB request-body limit is
  narrower than this app's existing 5 MB workbook-upload ceiling, and
  Supabase's Free tier has no automated backups meeting NFR-REL-01/02/03.
- No changes to business rules, permissions, database schema, or raw
  Stitch exports.

### Fixed — Overlay Centering, History Duplication, and Auto-Applying Filters

See `docs/adr/0012-centered-overlays-and-auto-apply-filters.md` for full
root-cause detail.

- **Every overlay is now centered** — `Modal.tsx` (the one shared
  primitive behind all 14 add/edit/history/confirmation dialogs) now
  centers explicitly (`fixed inset-0 m-auto`) instead of relying on the
  browser's `dialog:modal` default, which Tailwind's Preflight reset
  breaks. Bounded to the viewport height with its own internal scroll.
- **History no longer shows a field's value twice** — `ValueDiff`'s
  diffing logic was extracted into a pure, unit-tested function
  (`src/lib/domain/audit-diff.ts`) and the redundant duplicate-rendering
  branch removed.
- **Edit forms no longer render right-aligned** — same root cause as the
  centering fix: a `<dialog>`'s top-layer painting doesn't change its DOM
  position for CSS inheritance, so a dialog opened from a
  `text-right`-styled Actions cell inherited that alignment. `Modal.tsx`
  now sets `text-left` explicitly.
- **Filters on Daily Expenses, Assets, and Audit Log now apply
  automatically** — converted from a full-page `<form>` GET submission to
  client-side `router.replace` (select/date: immediate; free-text search:
  ~300ms debounce), via a shared hook (`src/components/filters/useFilterNavigation.ts`)
  and pure query-merge helpers (`src/lib/navigation/filter-query.ts`). The
  "Apply Filters" button is gone; "Reset Filters" is kept everywhere
  (newly added to Assets, for consistency).
- **The "Leave site?" prompt no longer fires for filter changes** — a
  direct consequence of the above: `router.replace` never unloads the
  document, so `OfflineProvider`'s `beforeunload` listener is
  structurally unreachable from a filter action. Its own gate condition
  was extracted into a pure, unit-tested predicate
  (`src/lib/offline/unsaved-work.ts`) proving it already correctly
  excludes an empty or fully-synced queue.
- `tests/e2e/entries.spec.ts` and `tests/e2e/phase5-reporting.spec.ts`
  updated for the new interaction. A pre-existing, unrelated
  `phase7-administration.spec.ts` failure (a duplicate-error strict-mode
  locator violation in `MasterDataManager`) was verified to reproduce
  identically on the unmodified base commit and was left as out of scope.

### Added — Sidebar and Navigation Rework

Audited every authenticated page route against `src/lib/navigation/nav-items.ts`
and found the six Phase 7 Administration screens had no sidebar link at
all (ADR-0009 decision 9 — reachable only via the in-page
`AdministrationTabs` bar or a typed URL). See `docs/adr/0011-sidebar-navigation-rework.md`.

- Every Admin-authorized route (Users, Parties, Expense Items, Expense
  Categories, Vendors, Profit Split, Historical Import) now has a real
  sidebar link — no route requires typing a URL by hand.
- The sidebar is grouped into six sections in a fixed order: Overview,
  Daily Operations, Monthly Operations, Reports, Offline and Sync,
  Administration. A role with nothing in a section never renders that
  section's heading.
- Administration is the only collapsible section (expanded by default;
  auto re-expands when navigation lands on a route inside it, overriding
  any manual collapse).
- No change to authorization, schema, or business logic — sidebar
  visibility remains presentational only; every page's own
  `requirePermission(...)` call is unchanged and is still the real guard,
  proven by the existing Phase 7 authorization sweep tests (unmodified).
- `tests/e2e/shell.spec.ts` and `tests/unit/navigation/nav-items.test.ts`
  updated to match (Admin nav-item count 15 → 21; new tests for the
  Administration collapse/expand behavior and for no horizontal overflow
  at 375/768/1440px on the Administration section specifically).

### Added — Phase 8A: Internal Acceptance and Release Hardening

Phase 8 is split. 8A closes the internal code, security, and verification
gaps that need no deployed environment. 8B — deployment, backup/restore
rehearsal, real-device verification, and client UAT — is not started.

- **Security headers and an enforced Content-Security-Policy.** HSTS
  (production only, no `preload` until the production domain and its
  subdomains are settled), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
  A nonce-based CSP generated per request in `src/proxy.ts` (Next 16's
  replacement for `middleware.ts`), enforced from the start rather than
  report-only, with no `'unsafe-inline'` or `'unsafe-eval'` in
  `script-src`. Non-browser tests verify the policy shape, nonce rotation,
  production-only HSTS without `preload`, and the bounded static exception.
  Browser coverage is preserved but was explicitly deferred for this
  completion, so no full browser validation is claimed. Two documented
  exceptions remain: the two static offline pages and Next's unmatched-route
  404 nonce limitation.
- **Generic error handling completed** (NFR-SEC-10). `(app)/error.tsx`
  and `(app)/not-found.tsx` already existed; added `global-error.tsx`
  (root layout failures), a root `not-found.tsx` (URLs outside the `(app)`
  group), and `(auth)/error.tsx` — the last mattering most, since a
  pre-authentication failure must tell an anonymous caller nothing about
  the database, the mail transport, or which accounts exist.
- **Host-native structured JSON logging** (`src/lib/observability/logger.ts`,
  NFR-REL-06) — one JSON object per line, redacting every secret-shaped
  key and free-text credential/token shape, and refusing to serialize
  binary payloads. Next's `src/instrumentation.ts` `onRequestError` hook
  captures uncaught server render, Route Handler, Server Action, and Proxy
  errors. Sentry deliberately declined per CON-02/CON-07.
- **`/api/health` now actually checks health.** It previously returned a
  static `{status:"ok"}` without touching Postgres, so an uptime monitor
  built on it would have stayed green through a total database outage. It
  now runs `SELECT 1` behind a 3-second timeout and returns a leak-free
  body.
- **Per-user rate limiting** on import preview and sync upload — bounded,
  cleanup-aware, keyed by user id rather than IP, and documented as
  single-instance-only. Import request length is checked before multipart
  parsing, file size before workbook parsing, and actual bytes again in the
  service layer.
- **Import sessions scoped to their uploader.** One Admin could previously
  claim another Admin's session; the audit rows would then have credited
  the wrong actor. Ownership is now checked atomically inside the claim.
- **Import preview rejects work before allocation.** Admin authorization,
  the request-size guard, and the per-user limit now run before multipart
  parsing; the service layer retains its independent permission check.
- **NFR-USE-06 gaps closed.** Three archive paths had no confirmation at
  all: master-data archiving (single click), the Monthly Party Bill
  "Clear", and emptying a saved Party Income grid cell. The grid uses an
  inline prompt rather than a modal — a modal opening on blur would seize
  focus and break NFR-USE-02's keyboard-only grid operation.
- **FR-RPT-02's pending-upload count** added to the Dashboard, now that
  Phase 6 provides a real queue to count.
- **Exhaustive authorization verification.** An explicit protected-surface
  registry lists all 58 guarded server functions; the sweep genuinely
  calls each with every role plus unauthenticated and deactivated callers,
  asserts both directions, proves the guard runs before validation, and
  drift-checks call sites against registry entries. A Playwright sweep
  covers every route handler and page route over real HTTP, asserting no
  restricted field names in any denied response body.
- **Accessibility coverage** (`@axe-core/playwright@4.13.0`, the one new
  dependency): serious/critical WCAG 2.1 A/AA scanning, modal focus
  behaviour, and horizontal-scroll checks at 375/768/1440. The unresolved
  findings are recorded below; no clean accessibility result is claimed.
- **Cross-engine smoke** under Firefox, WebKit, and a phone viewport —
  explicitly not a substitute for real-device verification (NFR-CMP-02).
- **Performance:** NFR-PERF-06 extended to every list and grid screen at
  three years of data; NFR-PERF-07 (200 offline entries in 30s) measured
  through the real sync path. NFR-PERF-01/02/03 deliberately not
  asserted — they need a production build, not `next dev`.
- **Clean-database migration and seed rehearsal** (`npm run
rehearse:migrations`, in CI) — creates its own temporary database,
  applies all 7 migrations from zero, verifies the Appendix A counts and
  zero transactional/operational rows, and drops it. Never touches the dev
  or test databases.
- **Documentation:** `docs/security-review.md` (OWASP pass, dependency
  reachability analysis, secret handling), `docs/deployment.md` rewritten
  as a real runbook draft, `docs/handover.md`, `docs/change-requests.md`,
  `docs/SRS-open-questions.md`, ADR-0010, and the two SRS §10-required
  one-page user guides as **actual PDFs** (`docs/user-guides/`, generated
  with the existing pdfkit — no new dependency).
- **Known outstanding (not fixed):** the new accessibility spec reports
  serious/critical axe violations on the authenticated screens and a
  horizontal-scroll failure on the data screens, and two new
  compatibility-smoke tests fail. These are disclosed rather than skipped
  or weakened — see `docs/testing.md`. NFR-USE-07 and the accessibility
  bar are therefore **not** met at Phase 8A close.
- **Dependency audit:** both open advisories traced to their call sites
  and found unreachable; both offered fixes are breaking major
  downgrades. Reasoning recorded rather than blanket-upgraded. `npm audit
--omit=dev` now runs in CI.

### Added — Phase 7: Administration Area and Historical Import

- Master-data CRUD (parties, expense items, expense categories, vendors)
  for Admins — create, rename, archive, reactivate — never a physical
  delete (FR-MST-01 to 05). Name uniqueness is case/whitespace-insensitive
  at the database level (a functional unique index on
  `lower(btrim(name))`, covering active and archived rows alike), backed
  by a friendly application-layer pre-check and a stale-write
  compare-and-swap on every rename/archive.
- Profit-split percentages moved from a JSON blob to typed
  `DECIMAL(5,2)` columns (`split_a_percent`/`split_b_percent`),
  database-enforced non-null/in-range/summing-to-exactly-100 via a new
  `CHECK` constraint; an Admin-only settings screen edits the two
  percentages, disclosing plainly that a change affects every period's
  _live_ calculation immediately (no result is ever stored — DR-09),
  never described as future-only. The Partner A/B identity mapping
  itself is unchanged and stays fixed (no remapping added).
- User administration: Admin-only role/partner-flag change
  (`changeUserRole`), backed by three new database triggers on `users` —
  a last-active-Admin protection covering both deactivation and role
  downgrade (concurrency-safe via row locking, not a count-then-update
  race), a guard against removing partner status from a user mapped as
  Partner A/B, and automatic session revocation on any
  role/partner/active-status change from any code path — plus
  application-layer blocks on an Admin demoting their own role or
  removing their own partner flag.
- Historical data import (FR-IMP-01 to 04): a defined six-sheet Excel
  template (Daily Expenses, Monthly Expenses, Party Income (Daily),
  Party Income (Monthly Bill), Counter Income, Capital Contributions),
  upload → preview (validates and shows every row-level error, writes no
  business data) → commit (all-or-nothing, one transaction). A durable
  `ImportBatch` record (file hash, actor, status, row counts,
  delete-protected) is separate from an ephemeral `ImportSession` (the
  actual workbook bytes, 15-minute expiry, nulled on every terminal
  path). The import session is atomically claimed via a standalone
  conditional `updateMany` _before_ the business transaction opens, so a
  later rollback can never make a claimed session silently reusable —
  proven under real concurrent commit attempts. Commit always reparses
  the claimed session's own stored bytes from scratch and rejects
  cleanly with zero rows written if anything changed since preview (an
  archived reference, for example). Import security: formula cells,
  malformed files, unsupported/duplicate sheets, invalid dates, unsafe
  amounts, and unknown/archived references are all rejected; server-owned
  UUIDs are generated for every row; uploaded bytes are never written to
  disk, public storage, or any log.
- No new dependency — `exceljs` (already used for Phase 5's report
  exports) is reused for reading the import workbook.
- One migration (`phase7_administration_and_import`): the two new
  `Decimal` profit-split columns, `updated_at`/`updated_by` on four
  master-data tables, the `ImportBatch`/`ImportSession` tables and their
  enums, four functional unique indexes (with a migration preflight that
  fails clearly on any pre-existing normalized duplicate), the three new
  `users` triggers, and one new delete-rejection trigger on
  `import_batches`.
- `docs/adr/0009-phase-7-administration-and-import.md`, recording the six
  mandatory corrections applied to the original draft plan and every
  design decision made to satisfy them, plus a real UI bug
  (`MasterDataManager`'s naive `entityLabel.replace(/s$/, "")`
  singularization breaking for "Parties" and "Expense Categories") found
  and fixed while writing the Playwright suite.

### Added — Phase 6: Offline Operation and Synchronization

- Full offline entry for the four SRS-specified sync entities (Daily
  Expenses, Monthly Expenses, Party Income — daily grid cells, direct
  cash receipts, and monthly party bills — and Counter Income): a
  Dexie-backed per-user IndexedDB queue (`src/lib/offline/{db,queue,
coalesce,backoff,fingerprint,types}.ts`) with five deterministic
  client-side coalescing rules, capped-exponential-jitter backoff, and
  SHA-256-over-canonical-JSON operation fingerprints.
- `sync_operations` table (migration `20260822070612_phase6_offline_
sync`) — durable per-operation receipts keyed by a client-generated
  `operationId`: a genuine retry replays its stored result verbatim; a
  reused `operationId` carrying different content is rejected as
  `OPERATION_ID_REUSED`. `synced_at` backfilled for pre-existing rows
  (`audit_log` excluded — its append-only trigger correctly rejects
  `UPDATE`).
- Every mutation function across the four offline entities
  (`src/server/mutations/*.ts`) gained an optional trailing
  `tx?: Prisma.TransactionClient` parameter (additive, no existing call
  site changed) — the business write, its audit row, and the new
  receipt now commit together in one transaction for every synced
  operation.
- `capturedAt`/`syncedAt`: one server timestamp serves both on an
  ordinary online create; an offline upload preserves the device's own
  `capturedAt` and sets `syncedAt` only at server acceptance.
- `HEAD /api/sync/ping` (authenticated, 3s timeout, one retry) verifies
  a real reconnect — never the public health route, never bare
  `navigator.onLine`. `POST /api/sync/upload` (≤50 operations/batch) and
  `GET /api/sync/reference` (the reference-data cache snapshot) round
  out the sync API surface.
- Conflict protocol: a genuine stale write returns
  `{status:"CONFLICT", current, currentVersion}`; Keep Local re-queues
  as a new operation against the server's current version, Keep Server
  only discards the local queue entry — the server row is never touched
  by that choice.
- Receipt retention (`src/server/sync/retention.ts`): a 180-day window,
  Admin-only, a plain callable function meant to be invoked periodically
  rather than wired into a cron this deployment doesn't have yet.
- `public/sw.js`: a static, dependency-free, versioned service worker —
  caches only an explicit static-asset allowlist plus one `/offline`
  fallback page, never anything under `/api/` or any other page's
  server-rendered HTML. Background Sync is registered strictly as an
  enhancement (a postMessage hint to open tabs); `OfflineProvider`'s own
  startup/focus/visibilitychange/`online` listeners are the dependable
  sync trigger.
- `src/components/offline/{OfflineProvider,SyncStatusIndicator,
SyncCenter}.tsx`: the one place queue/connection state lives, the
  FR-OFF-03 header indicator (now consistent on every screen), and the
  Sync Center (`/sync-center`) — a re-implementation of the approved
  Stitch queue-list + Local/Server split-comparison layout with real
  entity data, never the handoff's Calibration/Next-Due-Date demo
  content.
- Sign-out warning (`UserMenu.tsx`, FR-AUTH-09) and a `beforeunload`
  prompt (FR-OFF-10) when anything is pending/failed/conflicted —
  neither ever erases the local queue; both are heads-ups, not
  destructive-action prompts.
- PWA manifest and icons (`app/manifest.ts`, `app/icon.tsx`,
  `app/apple-icon.tsx`, `app/manifest-icons/*`) generated with
  `next/og`'s `ImageResponse` (bundled with Next.js, no new dependency)
  from the existing approved sidebar brand mark — never placeholder art.
- Exact dependencies: `dexie@4.4.5`, `dexie-react-hooks@4.4.0` — no
  other new dependency.
- Three real, non-test-only bugs found while writing the offline
  Playwright suite and fixed: `OfflineProvider` closing its Dexie
  connection on every unmount (React StrictMode's double-invoke turned
  this into a silent `DatabaseClosedError` swallowing offline saves); a
  hydration mismatch from reading `navigator.onLine` synchronously as
  `useState`'s initial value (fixed with `useSyncExternalStore`); and
  the sidebar using a plain `<a>` instead of `next/link`'s `<Link>`,
  which forced a full page reload on every in-app navigation and made
  offline navigation impossible.
- A pre-existing, unrelated migration-history checksum-bookkeeping issue
  on Phase 5's `phase5_partner_mapping` migration was found and repaired
  non-destructively (no reset, no data loss) before the Phase 6
  migration was generated — see `docs/adr/0008-phase-6-offline-sync.md`.
- See `docs/adr/0008-phase-6-offline-sync.md` and `docs/offline-sync.md`
  for the full design record; `docs/REQUIREMENTS_TRACEABILITY.md`'s
  FR-OFF/FR-AUTH-09/NFR-SEC-09/NFR-REL-05/NFR-MNT-07 rows are updated.
  (Note: FR-OFF-12 and NFR-SEC-09 were initially disclosed as gaps here
  — see the closure entry immediately below, where both were built.)

### Added — Phase 6 closure: FR-OFF-12, NFR-SEC-09, and a real Offline Entry Workspace

- **FR-OFF-12 (provisional totals)**: `src/lib/offline/relevance.ts`
  computes which still-queued operations could affect the period a
  results screen is showing (single-day match for daily entities,
  whole-month for `periodMonth`-keyed ones); `ProvisionalNotice` (banner)
  and `ProvisionalTotalsWrapper` (dashed-amber ring on the total tiles)
  wire this into the Partner Dashboard and Monthly Summary. Unit-tested
  (`tests/unit/offline/relevance.test.ts`) and proven end-to-end
  (`tests/e2e/offline-sync.spec.ts`'s FR-OFF-12 test): a genuinely
  unsynced Counter Income entry for today makes the Dashboard's tiles
  show "Provisional" until it syncs.
- **NFR-SEC-09 (offline data cleared on sign-out)**:
  `clearOfflineDataIfQueueEmpty` (`src/lib/offline/cleanup.ts`) re-checks
  the real `operations` count directly against IndexedDB and, only when
  it is genuinely zero, deletes the entire per-user offline database
  (`deleteOfflineDatabase`, `db.ts`) — reference cache, `recentRecords`,
  and `operations` together. Wired into `UserMenu.tsx`'s sign-out;
  deliberately does not clear anything mid-session (that would defeat
  FR-OFF-14's 90-day readable-history requirement for a device still in
  use). Both directions — an empty queue clears, "Sign out anyway" with
  something queued never does — are proven directly against real
  IndexedDB in `tests/e2e/offline-sync.spec.ts`.
- **A real Offline Entry Workspace** (`src/app/offline-entry/page.tsx`,
  `src/components/offline/OfflineEntryWorkspace.tsx`): a genuinely
  static, unauthenticated page hosting all four offline entry workflows,
  reading only this device's own cached reference data and queuing
  through the same `enqueueOperation` as every other form.
  `public/sw.js` precaches its HTML and serves it as the fallback for
  _any_ failed navigation — ahead of the plain `/offline` page — so
  reopening the installed app with zero connectivity reaches a page the
  user can actually act on, not a dead end. Linked from the Sidebar
  (`src/lib/navigation/nav-items.ts`). `src/lib/offline/last-user.ts`
  remembers which signed-in user's IndexedDB to write into when there is
  no live session to ask (a non-secret breadcrumb, never a credential).
  An initial version also eagerly precached the page's own JS chunk and
  every asset it references; reverted after it measurably destabilized
  the Playwright suite in `next dev` (large, unminified dev-mode chunks
  refetched on every fresh service-worker registration) without being
  required — reaching the workspace is proven with the HTML-only
  precache alone, and full interactivity is proven separately via a
  realistic online-then-offline flow. See ADR-0008 decision 11 for the
  full reasoning and the one disclosed residual case (a device's
  genuinely first-ever offline visit to this specific page, before
  loading any other authenticated page at all).
- **Playwright reliability, root-caused**: `tests/e2e/offline-sync.spec.ts`
  tests were calling `context.setOffline(true)` immediately after a
  `page.goto`, without letting that navigation's own in-flight requests
  settle first — severing the network mid-request stalled even a plain
  `.fill()` on an already-rendered field. Adding
  `await page.waitForLoadState("networkidle")` before every
  `context.setOffline(true)` fixed it outright (16/16 clean runs across
  `--repeat-each=2`, no retries needed). Separately, `playwright.config.ts`
  now runs with `workers: 1` and generous, documented timeouts — the
  broader class of timeout-only failures (never a wrong value) reproduced
  even under a single worker with an idle file tree, ruling out an actual
  cross-request data race.
- `docs/REQUIREMENTS_TRACEABILITY.md`'s FR-OFF-01/FR-OFF-12/NFR-SEC-09
  rows updated to Done, reflecting behavior actually proven above — not
  marked complete until the corresponding test existed and passed.

### Added — Phase 5 closure: FR-RPT-05, FR-AUD-06, and skip removal

- Income by Party (`src/app/(app)/(partner)/party-income-report`,
  `getPartyIncomeReport`): FR-RPT-05/FR-PINC-08's "income by party across
  a chosen range" — daily/monthly/cash-receipt components and a combined
  total, per party across an arbitrary validated date range, Postgres-side
  `groupBy`/`SUM` throughout; zero-income parties shown, never omitted;
  Partner/Admin-only, Operator denied through the UI and a direct call.
- FR-AUD-06 now covers `asset`/`capital_contribution` audit rows too — a
  batched (never N+1) live lookup of `acquiredOn`/`entryDate` resolves
  their business date, since neither is ever written into the audit
  JSON snapshot. Previously `null` for both entity types; still `null`
  only when the date is genuinely unset.
- Removed the one conditional Playwright skip in
  `tests/e2e/phase5-reporting.spec.ts`: the "History button" test now
  creates its own Asset fixture through the real form, rather than
  depending on the shared dev database already containing one.
- See `docs/adr/0007-phase-5-calculations-dashboard-reports.md` §13/§14
  for the full record; `docs/REQUIREMENTS_TRACEABILITY.md`'s FR-RPT-05
  and FR-AUD-06 rows are now both `Implemented` with no disclosed gap.

### Added — Phase 5: Calculations, Dashboard, Warnings, Reports, and Audit Log

- `app_settings.partner_a_user_id`/`partner_b_user_id` — explicit Partner
  A/B identity for the profit split (never account-creation order), two
  `CHECK` constraints (both-configured-or-neither; distinct), two
  `reject_if_not_partner()` triggers, `ON DELETE RESTRICT` — one additive
  migration (`20260821181426_phase5_partner_mapping`), no earlier
  migration touched, no `prisma db push`. The Admin-only setup action
  (`profit-split:configure-partners`) is write-once.
- Monthly Summary (`src/app/(app)/(partner)/monthly-summary`): any
  user-chosen date range or one-action month-stepping; itemised
  Administration/Purchasing breakdown (partner-funded categories shown
  as their own tagged line, never hidden, per BR-07/FR-RES-06); the
  50/50-default profit split applied and shown per partner, or an
  explicit "configuration required" state (never a fabricated split)
  until both partners are mapped; PDF (A4, `pdfkit@0.19.1`) and Excel
  (5 sheets, `exceljs@4.4.0`) exports, both stamped with the range,
  Asia/Karachi generation time, and the producing user.
- Partner Dashboard (`src/app/(app)/(partner)/dashboard`): real
  current-vs-previous-month income/expense/result tiles; a plain,
  accessible SVG/CSS 6-month trend chart (no charting library added);
  a warnings panel — missing recurring bill, missing instalment line,
  and marked variance from the prior month (approved formula: `max(Rs
5,000, previous × 20%)` threshold).
- Audit Log (`src/app/(app)/(partner)/audit-log`): read-only, filterable
  by user/record type/date range, keyset (never `OFFSET`) pagination; a
  reusable "History" action wired into Daily/Monthly Expense, Asset,
  Monthly Party Bill, Counter Income, and Capital Contribution rows;
  defensive recursive redaction (case-insensitive substring match on 8
  keywords) applied inside the query layer itself, before a row's
  before/after values ever leave it.
- `src/lib/domain/decimal-export.ts`'s `toSafeExcelNumber` — the sole,
  six-step-verified boundary where a monetary `Decimal` becomes a JS
  `number`, only for ExcelJS's numeric-cell API; formula-injection
  protection (`sanitizeTextCell`) on every free-text export cell.
- The July 2026 reconciliation fixture (`tests/fixtures/july-2026-corrected.ts`)
  and its permanent regression test, reproducing the **corrected**,
  single-AT-WASTE figures (Income Rs 1,495,535; Expenses Rs 1,287,459;
  Profit Rs 208,076; Rs 104,038 per partner; Daily Expenses Rs 171,190;
  Daily-billing Party Income Rs 225,650) — see
  `docs/adr/0007-phase-5-calculations-dashboard-reports.md` for why the
  corrected figures were used instead of AC-02's literal, uncorrected
  prose.
- Full Operator authorization sweep across every new Phase 5
  query/route (`tests/integration/authorization/phase5-authorization-sweep.test.ts`),
  and performance tests proving NFR-PERF-04/05 hold with three years of
  synthetic data loaded (NFR-PERF-06).
- **Fixed:** `getItemizedExpenseBreakdown` previously summed only
  Business-funded rows per category, silently hiding a category with
  only partner-funded spending — a direct contradiction of
  BR-07/FR-RES-06. Now groups by `(categoryId, fundingSource)`, so a
  partner-funded line always appears, separately tagged.
- **Fixed:** the PDF export route threw `ENOENT` on `pdfkit`'s
  `Helvetica.afm` under Next.js's default server-side dependency
  bundling. `next.config.ts` now sets `serverExternalPackages: ["pdfkit"]`.
- **Deferred (approved):** FR-WARN-05 (per-month warning dismissal) —
  needs new persisted per-user/per-month state outside this phase's
  data-model scope.
- **Disclosed gap:** FR-RPT-05 ("income by party across a chosen range")
  was not built as its own report screen in this phase.

### Added — Phase 4: Monthly Expenses, Assets, and Partner Investment

- `assets.default_category_id` and the extended `assets_acquisition_mode_check`
  (requires it for `INSTALMENT`, forbids it for `CASH`), plus the
  `party_income_active_monthly_party_month_unique` partial unique index
  with a preflight duplicate guard — one additive migration
  (`20260821170513_phase4_monthly_assets_investment`), no earlier
  migration touched, no `prisma db push`.
- Monthly Expenses (`src/app/(app)/(partner)/monthly-expenses`):
  Administration/Purchasing sections, a read-only system-generated Daily
  Expenses line, same-category duplicate warning, and two batch actions —
  Partner-triggered/previewed/confirmed instalment-line generation
  (`generateInstalmentLines`) and recurring-line pre-fill
  (`applyRecurringPrefill`), each creating one row per asset/category in
  its own transaction with its own audit event, concurrency-proven
  idempotent via the Phase 1 partial unique index.
- Asset Register (`src/app/(app)/(partner)/assets`): Cash/Instalment
  acquisition-mode toggle, mutually exclusive at form, Zod, and DB
  layers; Cash mode requires a purchasing partner as part of the same
  required field, never an optional checkbox; Instalment mode requires a
  positive monthly instalment and an active Purchasing default category
  (server-validated); filterable by classification/mode/status with a
  Cash purchase-price total; archiving stops future instalment
  generation only.
- Monthly Party Bill (`src/app/(app)/(partner)/party-income-monthly`,
  new `party-income:monthly-bill` permission): one figure per
  monthly-billing party per month, DB-enforced; completes FR-PINC-07's
  three-way total (daily + monthly + cash receipts) via the new
  `getPartyMonthlyTotals` query. FR-PINC-08 remains Partial — totals are
  shown for a calendar month only; an arbitrary custom date range is not
  yet offered.
- Partner Investment (`src/app/(app)/(partner)/investment`): Capital
  Contribution/Drawing entry (amount always positive `Decimal`,
  `contributionType` conveys the sign) and a per-partner itemised
  statement with running balance, reusing the unchanged Phase 1
  `partnerInvestmentTotal`.
- Four new Partner-only sidebar entries (`nav-items.ts`) for the above —
  no dashboard, report, or warnings functionality built (explicit
  approved scope decision; those remain Phase 5).
- New tests: `tests/integration/mutations/{monthly-expenses,assets,
capital-contributions}.test.ts`, `tests/integration/constraints/
party-income-monthly-unique.test.ts`, `tests/integration/queries/
{party-monthly-totals,capital-contributions}.test.ts`,
  `tests/unit/validation/{monthly-expense,asset,capital-contribution}.test.ts`,
  `tests/e2e/monthly-workflows.spec.ts`. Full suite: 298 Vitest tests
  across 48 files, 44 Playwright e2e tests.
- See `docs/adr/0006-phase-4-monthly-assets-investment.md` for the full
  design record.

### Added — Phase 3B closure: filters, edit/archive UI, and money formatting

- `src/lib/domain/money-format.ts` (`formatMoney`): one shared,
  Decimal-safe display formatter (`"Rs 1,234.56"`, thousands separators,
  always two decimals; pure string manipulation, never `Number()`/
  `parseFloat`/`.toNumber()`), applied across Daily Expenses, Party
  Income (grid totals, Cash Receipt confirmation), Counter Income (list,
  total, duplicate warning), and Operator Home's Recent Entries.
- Daily Expenses filter controls (`src/app/(app)/(operator)/
daily-expenses/page.tsx`): date range, item-or-description search, and
  funding source, all reflected in the URL query string and validated
  server-side (`listDailyExpensesSchema`); a Reset Filters action; a
  filter-aware empty state.
- Daily Expense edit/archive UI (`src/components/entries/
{DailyExpenseFormFields,DailyExpenseRowActions}.tsx`): edit opens a
  dialog prefilled from the row's own values and submits its
  `expectedUpdatedAt` for the existing atomic conditional-write check;
  archive reuses the confirmation `Modal`, naming the exact record; a
  stale edit/archive shows a clear reload message rather than silently
  failing.
- Cash Receipt's confirmation now shows a visible "amount recorded for
  &lt;party&gt;" state before closing (NFR-USE-04), and its reachability
  from both Operator Home and the Party Income page is now e2e-proven.
- Fixed a Turbopack crash on `/party-income`: `formatMoney`'s first
  version transitively imported the generated Prisma client (a Node-only
  module) into two Client Components' browser bundles. The `Decimal`
  import is now type-only; see `docs/adr/0005-phase-3b-operator-
workflows.md` §13.
- New tests: `tests/unit/domain/money-format.test.ts`; a Cash Receipt
  idempotent-replay/concurrency test in `tests/integration/mutations/
party-income.test.ts`; Playwright coverage in `tests/e2e/entries.spec.ts`
  for filters, the edit/archive/stale-write lifecycle, and Cash Receipt
  (reachability, visible confirmation, `CASH_DIRECT` persistence, one
  audit row) via two new DB-check helper scripts
  (`scripts/e2e-verify-party-income-row.ts`,
  `scripts/e2e-touch-daily-expense.ts`) following the existing
  `scripts/e2e-create-user.ts` child-process pattern.

### Added — Phase 3B: Operator Transaction Workflows

- `src/app/(app)/(operator)/daily-expenses/page.tsx` +
  `src/components/entries/DailyExpenseDrawer.tsx`: Daily Expense list
  (current month, date/item/amount/funding-source) and a native-`<dialog>`
  create drawer — item selectable from the active managed list or "Other"
  free text, Business/Partner funding-source toggle with a required
  partner selector when Partner is chosen (DR-07).
- `src/app/(app)/(operator)/party-income/page.tsx` +
  `src/components/entries/{PartyIncomeGrid,GridCellInput,CashReceiptModal}.tsx`:
  the daily-billing party income grid — sticky day column, horizontal
  scroll, one column per active daily-billing party (plus any archived
  party with in-month history, rendered read-only) — and a direct Cash
  Receipt modal (`receipt_type: "CASH_DIRECT"`, required note, any billing
  mode). Each cell is a full autosave state machine (idle/dirty/saving/
  saved/error/stale) with Enter-to-move-down and caret-gated arrow-key
  navigation across the grid.
- `src/app/(app)/(operator)/counter-income/page.tsx` +
  `src/components/entries/CounterIncomeForm.tsx`: daily counter-income
  list/total plus a create form implementing FR-CINC-04's two-step,
  non-blocking duplicate-date warning ("Record Anyway" resubmits with the
  same `client_uuid`, never a hard rejection). `counter_income.amount`
  allows zero — the one table with `CHECK (amount >= 0)`.
- `src/app/(app)/(operator)/home/page.tsx`: real Quick Actions (Add Daily
  Expense / Enter Party Income / Add Counter Income / Record Cash Receipt)
  and a real Recent Entries table (`captured_at DESC, id DESC` across all
  four entry kinds) — replaces the Phase 2 placeholder. No "Pending
  Uploads" tile, no per-row sync status — both would fabricate state that
  doesn't exist until Phase 6's offline queue.
- `src/lib/domain/calendar-date.ts`: strict `YYYY-MM-DD`/`YYYY-MM` parsing
  (round-trip validated via `Date.UTC`, never `z.coerce.date()`) and
  Asia/Karachi "today"/month-boundary helpers via
  `Intl.DateTimeFormat(...).formatToParts()` — never `.format()`, whose
  output shape isn't part of the stable `Intl` contract.
- `src/lib/validation/{money,daily-expense,party-income,counter-income}.ts`:
  Zod schemas for every Phase 3B write — amounts as regex-validated
  decimal strings (never `z.coerce.number()`), dates via the calendar-date
  parser, `client_uuid` required on every create.
- `src/lib/audit.ts` (`appendBusinessAudit`): the business/financial
  counterpart to Phase 2's `appendAuthAudit`, accepting **only**
  `Prisma.TransactionClient` so every audit write commits or rolls back
  atomically with its business mutation.
- `src/lib/prisma-errors.ts` (`isUniqueConstraintViolationOn`): identifies
  which unique constraint a P2002 violation came from (via the Prisma 7
  driver-adapter error's own `constraint.fields`) — the mechanism behind
  concurrent-safe create-idempotency (client-generated `client_uuid`,
  the database's own constraint as the final authority under real
  concurrency, never `findUnique`-then-`create` alone).
- `src/server/mutations/{daily-expenses,party-income,counter-income}.ts` +
  thin `src/server/actions/*.ts` wrappers: framework-independent mutation
  cores (testable directly against a real database, no Next.js request
  context needed) implementing create-idempotency, atomic
  conditional-write stale-write protection (`updateMany` gated on
  `id`/`expectedUpdatedAt`/`isArchived`), and transactional auditing.
- `src/server/queries/{daily-expenses,party-income,counter-income,home}.ts`:
  read-side queries, including the grid's archived-party-with-history
  visibility rule and its per-party/per-day/grand totals.
- `prisma/migrations/20260821070503_phase3b_party_income_daily_cell_unique/`:
  additive migration adding `party_income_active_daily_cell_unique`
  (mirrors the Phase 1 instalment partial-unique-index pattern), scoped to
  `receipt_type = 'DAILY'` only — preflight-checked for conflicts before
  writing (none found), never touching the Phase 1 migration.
- `docs/adr/0005-phase-3b-operator-workflows.md`: the full design record
  for the above.
- Full test coverage: unit (calendar-date, money/validation schemas),
  integration (business audit atomicity, the new partial unique index,
  every mutation's idempotency/concurrency/stale-write/duplicate-warning
  behavior, the grid query's archived-visibility rule), and Playwright e2e
  (all three new screens, direct-route authorization, updated nav-item
  counts).

### Added — Phase 3A: Shared Application Shell and Reusable UI Foundation

- `src/app/(app)/layout.tsx` + `src/components/layout/AuthenticatedShell.tsx`:
  the shared chrome every authenticated screen now renders through. The
  `(operator)`, `(partner)`, `(admin)` route groups moved one directory
  level deeper, under `(app)`; public route URLs are unchanged (`/home`,
  `/dashboard`, `/users`) — route groups never appear in the URL.
- `src/components/layout/{ShellChrome,Sidebar,Header,UserMenu}.tsx`: fixed
  desktop sidebar, a mobile navigation drawer, and a header (mobile menu
  button, contextual page title, initials avatar, role label, user menu
  with sign-out). No notification bell or sync indicator — both would
  imply functionality that doesn't exist yet; the sync indicator gets real
  state in Phase 6. Both the mobile drawer and the user menu are native
  `<dialog>` elements opened via `showModal()`, so focus-trapping,
  Escape-to-close, and focus-return to the triggering element are all
  browser-native behavior.
- `src/lib/navigation/nav-items.ts`: an **incremental** navigation table —
  only routes that exist today (Home/Dashboard/Users), filtered per role
  by the existing `hasAtLeastRole` rank comparison. Presentational only;
  every page still independently calls `requirePermission`.
- `src/components/ui/{Button,TextInput,Select,Checkbox,Card,Table,Badge,
Alert,Modal,EmptyState,LoadingSkeleton,Avatar}.tsx`: the reusable
  primitive set. `Modal` uses the native `<dialog>` element rather than a
  hand-rolled focus trap. `Avatar` is a neutral, initials-based component
  — no external avatar photo anywhere in the app (approved decision).
- `src/lib/fonts.ts`: Inter and Material Symbols Outlined self-hosted via
  `next/font/local` from vendored, OFL-1.1-licensed `.woff2` files under
  `public/design-assets/fonts/` — no `next/font/google`, no request to
  Google Fonts at build or runtime. Source, version, license, and checksum
  recorded in `public/design-assets/fonts/PROVENANCE.md`.
- `src/app/globals.css`: the complete design-token system (full color
  palette, 8-step typography scale, spacing, radius — `full`/pill reserved
  for avatars/badges only, per the already-approved radius decision) and
  `prefers-reduced-motion` handling.
- The four Phase 2 `(auth)` screens (Sign In, Forgot Password, Reset
  Password, Accept Invitation) retrofitted onto the new `Button`/
  `TextInput`/`Card`/`Alert`/`Checkbox` primitives — a behavior-preserving
  refactor; a session-expired banner (`?expired=1`) added to Sign In,
  shown only when the shell's redirect finds a stale session cookie.
  `/forbidden` restyled onto the shared tokens, deliberately kept outside
  `(app)` (no sidebar for a denied role).
- `tests/unit/navigation/nav-items.test.ts`, `tests/unit/ui/avatar.test.ts`,
  `tests/e2e/shell.spec.ts`: role-specific nav DOM presence/absence,
  direct-URL protection independent of navigation, mobile drawer keyboard/
  focus behavior, user menu/sign-out, skip-navigation, and a zero-external-
  font-request/zero-console-error proof. All pre-existing Phase 2 tests
  (127 Vitest, 9 of 18 Playwright specs) re-verified passing.
- `docs/adr/0004-phase-3a-shared-shell.md`: the design record for the
  route-group restructuring, the native-`<dialog>` mechanism choice, and
  the locally-hosted font decision.

### Added — Phase 2: Authentication and Authorization

- Better Auth integration (`src/lib/auth/config.ts`, `src/server/auth.ts`):
  the Prisma adapter (`@better-auth/prisma-adapter`), email/password
  sign-in with public self-registration disabled, 30-day sessions
  (FR-AUTH-05), 60-minute single-use password-reset tokens (FR-AUTH-06,
  stored hashed via `verification.storeIdentifier: "hashed"`), and no
  admin plugin (hand-built invitation/bootstrap/session-revocation
  instead, to avoid a duplicate `banned`/`is_active` deactivation
  mechanism).
- `prisma/migrations/20260820181038_phase2_auth/`: additive migration
  adding Better Auth's `sessions`/`account`/`verification` tables and five
  new `users` columns (`email_verified`, `image`, `updated_at`,
  `failed_login_count`, `lockout_until`) — the Phase 1 migration is
  untouched.
- `src/lib/auth/invitation.ts`: a two-layer invitation-acceptance
  mechanism — a project-owned, SHA-256-hashed "gate" token (plain Prisma
  rows, never Better Auth's internal adapter) wraps Better Auth's own
  public `requestPasswordReset`/`resetPassword` endpoints for the actual
  credential creation. The gate token is consumed only after credential
  creation fully succeeds (one `prisma.$transaction` with a
  `pg_advisory_xact_lock`), so a transient failure never permanently burns
  a legitimate invitation.
- `src/lib/auth/lockout.ts`: FR-AUTH-07's 10-failure/15-minute account
  lockout via one atomic `UPDATE ... RETURNING`, with a sign-in sequence
  that guarantees a locked or deactivated account's session is deleted
  before any `Set-Cookie` header is ever forwarded to the browser.
- `src/lib/permissions/`: the centralized `requirePermission`
  authorization layer (`roles.ts`, `matrix.ts`, `guard.ts`), called
  identically from every Server Component, Server Action, and Route
  Handler.
- `src/lib/email/`: fail-closed email delivery — SMTP/Nodemailer in
  production (refuses to start with incomplete configuration), a
  git-ignored local file sink in development/test (refuses to run when
  `NODE_ENV=production` regardless of configuration).
- `scripts/bootstrap-admin.ts`: a one-time, TTY-gated first-Admin
  bootstrap command — refuses to run if any `users` row already exists,
  never logs or emails its one-time setup link.
- Sign In screen (`src/app/(auth)/sign-in`) reproducing the approved
  Stitch design as real React components, plus forgot-password,
  reset-password, and accept-invitation pages, and minimal
  Operator/Partner/Admin placeholder routes proving role protection.
- `@better-auth/prisma-adapter@1.7.1`, `nodemailer@9.0.5`,
  `@types/nodemailer@8.0.1` added as exact-pinned dependencies.
- Two new `AuditAction` values: `SESSION_REVOKED`, `ACCOUNT_LOCKED`.
- `docs/adr/0003-phase-2-authentication.md`, recording the full Better
  Auth integration design and every disclosed security decision.

### Added — Phase 1: Database & Domain Foundation

- `prisma/schema.prisma`: the full 13-table SRS business schema (`users`,
  `parties`, `expense_items`, `expense_categories`, `vendors`,
  `daily_expenses`, `monthly_expenses`, `party_income`, `counter_income`,
  `assets`, `capital_contributions`, `audit_log`, `app_settings`), 10
  enums, every relation, exact-`Decimal` money columns, UTC
  `TIMESTAMPTZ` columns, and `client_uuid` on the four offline-capable
  tables.
- One versioned migration (`prisma/migrations/20260820170711_init/`),
  hand-edited to add: monetary `CHECK` constraints; bidirectional
  funding-source exclusivity; asset acquisition-mode mutual exclusivity;
  an instalment partial-unique index (one active row per asset/month);
  partner-eligibility triggers on `funded_by_user_id`,
  `purchased_by_user_id`, and `partner_user_id`; an audit-log append-only
  trigger; and physical-deletion-rejection triggers on all 13 tables.
- `src/lib/domain/`: pure, framework-agnostic functions for the
  funding-source rule, income/expense aggregation, net profit/loss, a
  deterministic profit-split rounding rule, and partner-investment
  aggregation (with `DRAWING` sign handling) — unit-tested with no
  server or database dependency.
- `prisma/seed.ts`: Appendix A master data (parties, expense items,
  expense categories, vendors, default profit split) — deliberately no
  users, no credentials, and no July 2026 transaction amounts.
- `@prisma/adapter-pg`, `pg`, `@types/pg`, and `tsx` added as
  dependencies — Prisma 7 requires an explicit driver adapter to connect
  at runtime, and `tsx` runs the TypeScript seed script.
- Real-PostgreSQL integration/constraint test suite
  (`tests/integration/`), a guarded `TEST_DATABASE_URL`-only test
  database helper, and a GitHub Actions Postgres service in CI.
- `docs/adr/0002-phase-1-schema-clarifications.md`, recording every
  disclosed deviation from SRS §6's literal schema text.

### Added — Phase 0: Repository & Development Foundation

- Next.js (App Router) + TypeScript strict-mode project scaffold under `src/`.
- Tailwind CSS, ESLint, Prettier configured.
- Vitest (one sanity test) and Playwright (one smoke test against the
  placeholder health page) configured.
- Prisma installed with an empty schema (generator + datasource only — no
  business models yet).
- Better Auth and Zod packages installed, unconfigured.
- GitHub Actions CI running the full validation suite.
- Documentation skeletons: `docs/architecture.md`, `docs/offline-sync.md`,
  `docs/deployment.md`, `docs/testing.md`, `docs/adr/0001-technology-stack.md`.
- Placeholder locations for the forthcoming Google Stitch UI handoff:
  `docs/UI_REQUIREMENTS.md`, `docs/ui/screenshots/`, `docs/ui/stitch-export/`,
  `public/design-assets/`, `src/components/ui/`, `src/components/layout/`.
