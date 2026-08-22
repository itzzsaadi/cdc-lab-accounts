# ADR-0008: Phase 6 — Offline Sync, Queueing, and PWA

## Status

Accepted. Implemented per the approved Phase 6 Plan Revision 2 and its 8 final mandatory decisions.

## Context

Phase 6 implements FR-OFF-01–14, the operation-queue/receipt architecture, and the PWA shell, per the approved "Phase 6 Plan — Revision 2" and its 8 final mandatory decisions (SHA-256 canonical-JSON fingerprints, an authenticated `/api/sync/ping`, single-transaction atomicity for business write + audit + receipt, `capturedAt`/`syncedAt` semantics, receipt retention, versioned service-worker caches, Background Sync as enhancement-only, and the exact `dexie`/`dexie-react-hooks` dependency pins).

## Decisions

### 1. Migration-history repair preceding the `sync_operations` migration

Before generating the Phase 6 migration, `npx prisma migrate dev --create-only` reported that `20260821181426_phase5_partner_mapping` (Phase 5's partner-mapping migration) had "been modified after it was applied," blocking further migration work without a `migrate reset`.

**Investigation** (kept strictly read-only until the cause was established): `git log --follow` showed the migration file has had exactly one version since its introducing commit (`cbcb201`) — unchanged through `HEAD`/the working tree. Comparing SHA-256 checksums of all 5 migration files against the values recorded in `_prisma_migrations` showed 4 of 5 matching exactly; only this one migration's recorded checksum (`da9135a0…5017`) differed from the committed file's actual checksum (`73abbccd…c39f7`), and this mismatch was identical in both the dev and test databases. Directly inspecting the live schema (`pg_constraint`/`pg_trigger`) confirmed both partner-mapping `CHECK` constraints and both `reject_if_not_partner` triggers were already present and correct in both databases — i.e., the DDL had been applied correctly; only the _recorded checksum_ was stale.

**Root cause**: this migration's own header documents it was "hand-edited per the documented Prisma escape-hatch pattern (CLAUDE.md §20)" — the base `ADD COLUMN`/`ADD CONSTRAINT` (FK) statements were Prisma-generated and applied first (recording that pre-edit checksum), then the file was hand-edited to add the two `CHECK` constraints and two triggers and committed as final — a normal, expected consequence of this project's documented workflow for constraints/triggers not expressible in the Prisma schema DSL, not data tampering or drift. No remote/staging/production database exists yet (confirmed against `docs/deployment.md` and the CI workflow, which provisions and tears down an ephemeral Postgres per run), so no shared environment could have been affected.

**Repair, not reset**: rather than `prisma migrate resolve --applied` (whose exact effect on an _already-successfully-applied_ migration's other columns — e.g. `started_at`/`finished_at` — is not documented and could not be verified without executing it against real data) or `prisma migrate reset` (which would have destroyed real seeded/entered data in both databases for no benefit, since the live schema was already correct), the checksum was corrected directly and narrowly:

1. The affected `_prisma_migrations` row was exported to a timestamped backup file (`.local/migration-backups/`, git-ignored) for both databases before any change.
2. A single guarded, transactional `UPDATE` — inside a `BEGIN`/`DO $$ … RAISE EXCEPTION on any precondition mismatch … END $$`/`COMMIT` block — located and updated **exactly one** row per database, matched on migration name, the exact stale checksum, `finished_at IS NOT NULL`, and `rolled_back_at IS NULL`; the block aborts (raises, forcing a rollback) if that match isn't exactly one row. Only the `checksum` column was written; `id`, `started_at`, `finished_at`, `applied_steps_count`, and `logs` are byte-identical to the pre-repair backup.
3. Post-repair, `prisma migrate status` reports "Database schema is up to date!" for both databases with no drift, and `prisma migrate diff --from-schema ./prisma/schema.prisma --to-config-datasource` against both live databases shows zero unexpected difference — the only diff present is the not-yet-migrated `sync_operations` addition already staged in `schema.prisma`, which is expected and is what the next migration adds.

No data was lost; no migration file, migration name, or non-checksum column was altered; `20260820170711_init` and every other migration remain untouched.

### 2. `sync_operations` durable receipts

One row per queued offline operation ever accepted/applied/conflicted/rejected — `operationId` (client-generated) as primary key, `requestFingerprint` (SHA-256 of canonical JSON, mandatory decision #1) to detect a genuine retry vs. a reused id, `resultBody` (JSONB) replayed verbatim on retry. Deliberately **not** covered by the physical-deletion-rejection triggers (like `sessions`/`account`/`verification` from Phase 2) — see decision 7 (retention) below.

### 3. `request_fingerprint` computed server-side, never trusted from the client

The wire protocol for `POST /api/sync/upload` does not actually transmit a client-computed fingerprint. The server always recomputes SHA-256 over deterministic canonical JSON (`src/lib/offline/fingerprint.ts`, sorted object keys, `undefined` handled like `JSON.stringify`) from `{entityType, action, clientUuid, payload}` — the exact operation content it received — rather than trusting a value the client claims. This is simpler (one less field on the wire) and removes any need to reason about a dishonest or buggy client-computed fingerprint; the same fingerprint function is reused client-side purely for the queue's own internal bookkeeping (detecting whether a coalesced merge actually changed anything), never as the source of truth for the server's replay decision.

### 4. True single-transaction atomicity via an optional trailing `tx` parameter

Every mutation function across the four offline-capable entities (`src/server/mutations/{daily-expenses,monthly-expenses,party-income,counter-income}.ts`) gained an optional trailing `tx?: Prisma.TransactionClient` parameter. When supplied, the function runs directly against that transaction instead of opening its own; when omitted, it opens its own transaction exactly as before. This is a purely additive signature change — no existing online call site needed to change — and it is what lets `src/server/sync/upload.ts` commit the business mutation, its audit row, and the new `sync_operations` receipt together, in one transaction, for every operation (mandatory decision #3). The lookup-by-`operationId`-first check and the receipt write happen inside that same transaction.

### 5. Conflict vs. rejection: re-reading the current row, not a new error taxonomy

The existing stale-write guard (a single conditional `updateMany` gated on `id + updatedAt + isArchived:false`, already used by every online update/archive) returns one generic failure message — it does not itself distinguish "the version moved" from "the row is already archived or gone." Rather than inventing a new return shape for every mutation function, `src/server/sync/apply.ts` re-reads the current row (inside the same transaction) only on failure: if its `updatedAt` differs from the operation's `expectedUpdatedAt`, that is a genuine `CONFLICT` (`{current, currentVersion}`, serialized narrowly — money as a string, dates as ISO, never a raw Prisma row); if the version already matches, the failure is an ordinary business `REJECTED`. This keeps the existing mutation functions completely unchanged.

### 6. `capturedAt`/`syncedAt` — one rule, two natural cases

Every create mutation now computes `syncedAt = new Date()` (the server-acceptance instant) unconditionally, and `capturedAt = payload.capturedAt ? new Date(payload.capturedAt) : syncedAt`. An ordinary online create never supplies `capturedAt`, so both columns get the identical server timestamp; an offline-queued upload supplies the device's own capture time, which is preserved, while `syncedAt` is still the moment the server actually accepted it. One rule, not two code paths. Pre-existing rows (created before this migration, all online) were backfilled `synced_at = captured_at` in the same migration — `audit_log` was deliberately excluded from that backfill, since its append-only trigger correctly rejects any `UPDATE`; this was discovered by the trigger itself rejecting the first migration attempt, not by having anticipated it, and the corrected migration was re-resolved (see the Phase 6 migration commit) rather than reset.

### 7. Receipt retention: a generous fixed window, not a blind TTL

`src/server/sync/retention.ts`'s `cleanupExpiredSyncReceipts` deletes only rows strictly older than 180 days — long enough that no realistic length of offline time causes a receipt to disappear before its device reconnects and retries (the actual danger window is not server response time, it's how long a device might legitimately stay offline after the server already committed the corresponding operation). Admin-only (`sync:retention-cleanup`), a plain callable function meant to be invoked periodically once this deployment adopts a scheduler — it does not wire itself into a cron that does not exist yet (CON-07: single-developer maintainability over premature infrastructure).

### 8. Service worker: static allowlist, never financial data, Background Sync as enhancement only

`public/sw.js` is hand-written and dependency-free. It caches only an explicit allowlist of genuinely static assets (`/_next/static/`, self-hosted fonts, icons, the manifest) plus one dedicated `/offline` fallback page for a failed navigation; it never touches anything under `/api/` and never caches any other page's server-rendered HTML, since every other page carries live financial data (mandatory decision #6). The cache name is versioned, and `activate` deletes every differently-versioned cache this worker owns. The `sync` event handler only posts a `BACKGROUND_SYNC_HINT` message to open tabs — it never attempts the upload itself (this worker has no Dexie/TypeScript runtime, and Background Sync support is inconsistent across browsers), so it is documented and treated strictly as an enhancement (mandatory decision #7); `OfflineProvider`'s own startup/focus/visibilitychange/`online` listeners are the dependable path.

### 9. PWA icons: locally derived from the existing brand mark, via `next/og`

The manifest/favicon/apple-icon are generated with `next/og`'s `ImageResponse` (bundled with Next.js — no new dependency) from `src/lib/brand/icon.tsx`: the same teal (`--color-primary`, `#005c55`) rounded square already used by the sidebar's brand mark, with a hand-drawn flask-glyph SVG path standing in for the sidebar's Material-Symbols "biotech" icon (whose font glyph outlines aren't available at build time) — never placeholder or stock artwork.

### 10. A real bug found while writing the offline e2e tests: the sidebar's navigation

Writing `tests/e2e/offline-sync.spec.ts` against the real running app (real IndexedDB, `context.setOffline(true)`) surfaced that `src/components/layout/Sidebar.tsx` used a plain `<a href>` instead of `next/link`'s `<Link>`, so every in-app navigation performed a full hard page reload — the opposite of a Next.js App Router SPA's purpose, and specifically fatal to offline navigation (a full reload cannot complete without a connection). Fixed by switching to `<Link>`. Two further real bugs surfaced and fixed in the same debugging pass: `OfflineProvider` was closing its Dexie connection on every unmount, which React's development-mode StrictMode double-invoke turned into a `DatabaseClosedError` inside `enqueue()`, silently swallowing offline saves (fixed by removing the close-on-unmount effect — per-user isolation was already fully handled by `getOfflineDb`'s own user-id-change check); and `isOnline`'s initial state read `navigator.onLine` synchronously, which cannot match the server-rendered value and produced a genuine hydration mismatch (fixed with `useSyncExternalStore`, React's own idiom for exactly this).

A related, disclosed platform limitation: a `<Link>` navigation to an already-visited/prefetched page works fine offline; navigating to a not-yet-prefetched dynamic route while genuinely offline cannot complete, because its React Server Component payload requires a live request. This is an inherent Next.js App Router constraint, not something this phase works around, and it does not affect FR-OFF's actual scope (offline _data entry_, not full offline app navigation).

## Remaining limitations (disclosed)

- FR-OFF-12 (mark figures provisional while offline uploads are pending) is not built this phase — see `docs/offline-sync.md`.
- NFR-SEC-09 (clear offline device data on sign-out once nothing is pending) is partial — isolation is enforced and nothing is ever silently erased while work is pending, but automatic clearing once the queue is empty is not implemented.
