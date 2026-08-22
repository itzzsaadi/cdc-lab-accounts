# ADR-0008: Phase 6 — Offline Sync, Queueing, and PWA

## Status

In progress. This ADR is being written incrementally as Phase 6 implementation proceeds; further sections covering the sync protocol, conflict resolution, service worker, and reference-data cache are added as those pieces land.

## Context

Phase 6 implements FR-OFF-01–14, the operation-queue/receipt architecture, and the PWA shell, per the approved "Phase 6 Plan — Revision 2" and its 8 final mandatory decisions (SHA-256 canonical-JSON fingerprints, an authenticated `/api/sync/ping`, single-transaction atomicity for business write + audit + receipt, `capturedAt`/`syncedAt` semantics, receipt retention, versioned service-worker caches, Background Sync as enhancement-only, and the exact `dexie`/`dexie-react-hooks` dependency pins).

## Decisions

### 1. Migration-history repair preceding the `sync_operations` migration

Before generating the Phase 6 migration, `npx prisma migrate dev --create-only` reported that `20260821181426_phase5_partner_mapping` (Phase 5's partner-mapping migration) had "been modified after it was applied," blocking further migration work without a `migrate reset`.

**Investigation** (kept strictly read-only until the cause was established): `git log --follow` showed the migration file has had exactly one version since its introducing commit (`cbcb201`) — unchanged through `HEAD`/the working tree. Comparing SHA-256 checksums of all 5 migration files against the values recorded in `_prisma_migrations` showed 4 of 5 matching exactly; only this one migration's recorded checksum (`da9135a0…5017`) differed from the committed file's actual checksum (`73abbccd…c39f7`), and this mismatch was identical in both the dev and test databases. Directly inspecting the live schema (`pg_constraint`/`pg_trigger`) confirmed both partner-mapping `CHECK` constraints and both `reject_if_not_partner` triggers were already present and correct in both databases — i.e., the DDL had been applied correctly; only the *recorded checksum* was stale.

**Root cause**: this migration's own header documents it was "hand-edited per the documented Prisma escape-hatch pattern (CLAUDE.md §20)" — the base `ADD COLUMN`/`ADD CONSTRAINT` (FK) statements were Prisma-generated and applied first (recording that pre-edit checksum), then the file was hand-edited to add the two `CHECK` constraints and two triggers and committed as final — a normal, expected consequence of this project's documented workflow for constraints/triggers not expressible in the Prisma schema DSL, not data tampering or drift. No remote/staging/production database exists yet (confirmed against `docs/deployment.md` and the CI workflow, which provisions and tears down an ephemeral Postgres per run), so no shared environment could have been affected.

**Repair, not reset**: rather than `prisma migrate resolve --applied` (whose exact effect on an *already-successfully-applied* migration's other columns — e.g. `started_at`/`finished_at` — is not documented and could not be verified without executing it against real data) or `prisma migrate reset` (which would have destroyed real seeded/entered data in both databases for no benefit, since the live schema was already correct), the checksum was corrected directly and narrowly:

1. The affected `_prisma_migrations` row was exported to a timestamped backup file (`.local/migration-backups/`, git-ignored) for both databases before any change.
2. A single guarded, transactional `UPDATE` — inside a `BEGIN`/`DO $$ … RAISE EXCEPTION on any precondition mismatch … END $$`/`COMMIT` block — located and updated **exactly one** row per database, matched on migration name, the exact stale checksum, `finished_at IS NOT NULL`, and `rolled_back_at IS NULL`; the block aborts (raises, forcing a rollback) if that match isn't exactly one row. Only the `checksum` column was written; `id`, `started_at`, `finished_at`, `applied_steps_count`, and `logs` are byte-identical to the pre-repair backup.
3. Post-repair, `prisma migrate status` reports "Database schema is up to date!" for both databases with no drift, and `prisma migrate diff --from-schema ./prisma/schema.prisma --to-config-datasource` against both live databases shows zero unexpected difference — the only diff present is the not-yet-migrated `sync_operations` addition already staged in `schema.prisma`, which is expected and is what the next migration adds.

No data was lost; no migration file, migration name, or non-checksum column was altered; `20260820170711_init` and every other migration remain untouched.

### 2. `sync_operations` durable receipts (see schema/migration for full design)

One row per queued offline operation ever accepted/applied/conflicted/rejected — `operationId` (client-generated) as primary key, `requestFingerprint` (SHA-256 of canonical JSON, mandatory decision #1) to detect a genuine retry vs. a reused id, `resultBody` (JSONB) replayed verbatim on retry. Deliberately **not** covered by the physical-deletion-rejection triggers (like `sessions`/`account`/`verification` from Phase 2) — see the retention-policy section added alongside the sync engine.

_(Further sections — sync protocol, conflict resolution, service worker versioning, reference-data cache, PWA icons — are appended as those parts of Phase 6 are implemented.)_
