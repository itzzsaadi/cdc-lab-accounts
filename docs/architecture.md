# Architecture Overview

Status: Phase 1 (database & domain foundation) and Phase 2 (authentication
& authorization) in place. Updated further as later phases add the
transaction/reporting/offline UI layers.

## Data layer (Phase 1)

- `prisma/schema.prisma` — the 13 SRS business tables (`docs/SRS.md` §6),
  10 enums, and every relation. Every money column is `Decimal @db.Decimal(14,2)`;
  every timestamp is `DateTime @db.Timestamptz(6)`, stored in UTC (DR-02) —
  Pakistan-time display conversion is a Phase 3+ presentation concern, not
  a storage one.
- Constraints and triggers that Prisma's schema language cannot express —
  `CHECK`s, partner-eligibility triggers, the audit-log append-only
  trigger, physical-deletion-rejection triggers, and the instalment
  partial-unique index — are hand-added to the generated migration SQL
  (`prisma/migrations/20260820170711_init/migration.sql`), per the
  documented Prisma escape-hatch pattern (`CLAUDE.md` §20). This is the
  only migration so far; every future schema change adds a new one.
- `docs/adr/0002-phase-1-schema-clarifications.md` records every place
  this schema deliberately deviates from SRS §6's literal text (the
  12-vs-13 table count, `users.password_hash` omitted, `app_settings.updated_by`
  nullable, the counter-income unique-constraint conflict, `assets`'
  `status`-only archive representation) and why.
- Prisma 7 requires an explicit driver adapter to connect at all — there
  is no bare-connection-string runtime path. `prisma/client.ts` exports
  one factory, `createPrismaClient(connectionString)`, used by both the
  seed script and every test helper, so the adapter-construction code
  exists in exactly one place.

## Domain layer (Phase 1)

`src/lib/domain/` — pure, framework-agnostic functions with no
`PrismaClient`, Next.js, or I/O dependency (only `money.ts` references the
generated client, and only for the `Decimal` value type):

- `funding-source.ts` — the funding-source rule (BR-02/05/06/07, DR-07).
- `result.ts` — income/expense aggregation and net profit/loss.
- `profit-split.ts` — the two-partner split with a deterministic
  rounding-remainder rule (BR-10/11).
- `investment.ts` — partner investment aggregation, including `DRAWING`
  sign handling (FR-INV-01/02, BR-06/08/11).

This isolation is what makes these functions unit-testable
(`tests/unit/domain/`) with no server or database, and what will make the
July 2026 reconciliation fixture (Phase 5) and the funding-source rule
testable in complete isolation, per `CLAUDE.md` §25.

## Authentication and authorization layer (Phase 2)

Full design record: `docs/adr/0003-phase-2-authentication.md`.

- `src/lib/auth/config.ts` — `buildAuth(prisma, baseURL)`, a factory (not a
  bare singleton) so integration tests can bind a Better Auth instance to
  the test database; `src/server/auth.ts` is the one real singleton the
  application uses, adding the production HTTPS/SMTP startup assertions.
- `src/lib/auth/invitation.ts` — the two-layer invitation-acceptance
  mechanism: a project-owned, SHA-256-hashed "gate" token (plain Prisma
  rows in the shared `verification` table, never Better Auth's internal
  adapter) wraps Better Auth's own public `requestPasswordReset`/
  `resetPassword` endpoints for the actual credential creation — no
  internal Better Auth API is ever called directly. The gate token is
  consumed only after credential creation fully succeeds (one
  `prisma.$transaction` with a `pg_advisory_xact_lock`), so a transient
  failure never burns a legitimate invitation.
- `src/lib/auth/lockout.ts` — FR-AUTH-07's 10-failure/15-minute lockout via
  one atomic `UPDATE ... RETURNING`, and the corrected sign-in sequencing
  that guarantees a locked or deactivated account's session is deleted
  before any `Set-Cookie` header is ever forwarded to the browser.
- `src/lib/permissions/` — `roles.ts` (OPERATOR ⊂ PARTNER ⊂ ADMIN), `matrix.ts`
  (the one centralized permission table every future functional area
  plugs into), `guard.ts` (`requirePermission`, called identically from
  every Server Component/Action/Route Handler).
- `src/lib/email/` — fail-closed SMTP (production)/git-ignored file sink
  (development/test) delivery; production refuses to start with an
  incomplete SMTP configuration.
- `src/server/auth.ts`, `src/server/session.ts`, `src/server/actions/auth.ts`,
  `src/server/cookies.ts` — the application's one Better Auth instance,
  the session/`is_active` re-check on every request, sign-in/out/invite/
  accept-invitation/reset/deactivate server actions, and the narrow
  `Set-Cookie` forwarder.
- `scripts/bootstrap-admin.ts` — the one-time, TTY-gated first-Admin
  bootstrap command.

## Not yet built

- Transaction/reporting/investment/dashboard/offline-queue UI and their
  API — Phase 3 onward.
- Full master-data admin UI and profit-split settings screen — Phase 7.
- UI screens generally — Phase 3 onward, translated from the Google Stitch
  handoff per `docs/UI_REQUIREMENTS.md` (Phase 2 implements only the Sign
  In screen and its extended states).

See `docs/PROJECT_PLAN.md` for the phase-by-phase implementation sequence
this document tracks, and `docs/adr/` for the detailed record of each
architectural decision.
