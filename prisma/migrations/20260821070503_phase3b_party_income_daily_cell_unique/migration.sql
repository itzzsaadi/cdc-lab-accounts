-- Phase 3B: Party Income daily grid cell idempotency (FR-PINC-02, DR-05,
-- mandatory implementation safeguard #4). Not expressible in
-- prisma/schema.prisma (Prisma 7 has no partial-unique-index DSL) — added
-- by hand to this generated (originally empty) migration, per the same
-- documented escape-hatch pattern already used for
-- monthly_expenses_active_instalment_per_asset_month in
-- 20260820170711_init/migration.sql. This migration is purely additive: it
-- never touches 20260820170711_init and never alters existing data.
--
-- Pre-migration duplicate-detection preflight (run against both the dev and
-- test databases before this migration was written, per the mandatory
-- safeguard's "stop hard on any conflict, never alter data automatically"
-- requirement):
--
--   SELECT party_id, income_date, count(*)
--   FROM party_income
--   WHERE receipt_type = 'DAILY' AND is_archived = false
--   GROUP BY party_id, income_date
--   HAVING count(*) > 1;
--
-- Result on both databases: 0 rows (party_income itself is empty — Phase 1
-- seeds zero transactions, per docs/adr/0002-phase-1-schema-clarifications.md
-- and prisma/seed.ts). No conflicting data exists, so this migration
-- proceeds; had the preflight returned any row, this migration would not
-- have been written until the conflict was resolved with the client.
--
-- Scope: at most one *active* DAILY-receipt-type party_income row per
-- (party, day) — the grid's "one cell per party per day" invariant,
-- mirroring the archive-then-correct-history pattern already established
-- for monthly instalments (archived rows fall outside the index, so a
-- corrected re-entry is always possible without violating uniqueness).
-- Deliberately scoped to receipt_type = 'DAILY' only: a party may still
-- have any number of CASH_DIRECT (direct cash receipt, FR-PINC-06) or
-- MONTHLY (FR-PINC-03, Phase 4) rows sharing the same party_id/income_date
-- without being restricted by this index at all.

CREATE UNIQUE INDEX "party_income_active_daily_cell_unique"
  ON "party_income" ("party_id", "income_date")
  WHERE "receipt_type" = 'DAILY' AND "is_archived" = false;
