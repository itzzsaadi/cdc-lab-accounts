# Architecture Overview

Status: Phase 1 (database & domain foundation) in place. Updated further
as later phases add the server/API/UI layers.

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

## Not yet built

- Server/API layer (`src/server`, `src/app/api`) — Phase 2 onward.
- The role model's server-side enforcement (`CLAUDE.md` §15/§16) —
  Phase 2.
- Better Auth's own tables (`session`, `account`, `verification`) and its
  configuration — Phase 2, per ADR-0002 decision 3.
- UI screens — Phase 3 onward, translated from the Google Stitch handoff
  per `docs/UI_REQUIREMENTS.md`.

See `docs/PROJECT_PLAN.md` for the phase-by-phase implementation sequence
this document tracks, and `docs/adr/` for the detailed record of each
architectural decision.
