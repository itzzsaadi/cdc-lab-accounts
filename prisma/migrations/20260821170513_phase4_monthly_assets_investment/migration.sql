-- Phase 4 (monthly expenses, assets, partner investment). Two additive,
-- independently-justified schema changes, hand-edited into this
-- create-only migration per the documented Prisma escape-hatch pattern
-- (CLAUDE.md §20) — see docs/adr/0006-phase-4-monthly-assets-investment.md.
-- Earlier migrations are never edited.

-- ----------------------------------------------------------------------------
-- 1. assets.default_category_id (approved decision 1): required only for
-- INSTALMENT-mode assets — the source of monthly_expenses.category_id
-- (NOT NULL) for every system-generated instalment line (FR-AST-04). Always
-- NULL for CASH assets. "Active + Purchasing group" is validated by
-- application code at create/edit time (src/server/mutations/assets.ts),
-- the same way an archived expense_item is prevented from being newly
-- selected on Daily Expenses without a DB trigger — reserving a new
-- generic trigger for this would duplicate the existing FK/is_active
-- pattern rather than add a genuinely new safeguard.
-- ----------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "default_category_id" UUID;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace the Phase 1 acquisition-mode CHECK with one that also requires
-- (INSTALMENT) / forbids (CASH) default_category_id, mirroring the existing
-- monthly_instalment/purchase_price/purchased_by_user_id exclusivity
-- exactly (DR-08, FR-AST-07).
ALTER TABLE "assets" DROP CONSTRAINT "assets_acquisition_mode_check";

ALTER TABLE "assets" ADD CONSTRAINT "assets_acquisition_mode_check" CHECK (
  ("acquisition_mode" = 'INSTALMENT' AND "monthly_instalment" IS NOT NULL AND "purchase_price" IS NULL AND "purchased_by_user_id" IS NULL AND "default_category_id" IS NOT NULL)
  OR
  ("acquisition_mode" = 'CASH' AND "purchase_price" IS NOT NULL AND "purchased_by_user_id" IS NOT NULL AND "monthly_instalment" IS NULL AND "default_category_id" IS NULL)
);

-- ----------------------------------------------------------------------------
-- 2. One active MONTHLY party_income row per party per month (approved
-- decision 2, FR-PINC-03). Mirrors party_income_active_daily_cell_unique's
-- exact shape (Phase 3B) — archive-then-correct history is preserved,
-- only one *live* row is enforced. A preflight guard runs first and
-- refuses to apply the index if any party/month pair already has more
-- than one active MONTHLY row — this migration never archives or alters
-- a conflicting record itself; a real conflict must be resolved by hand
-- before re-running it.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM (
    SELECT "party_id", "income_date"
    FROM "party_income"
    WHERE "receipt_type" = 'MONTHLY' AND "is_archived" = false
    GROUP BY "party_id", "income_date"
    HAVING COUNT(*) > 1
  ) "dupes";

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply party_income_active_monthly_party_month_unique: % party/month pair(s) already have more than one active MONTHLY party_income row. Archive the extras by hand, then re-run this migration.', duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX "party_income_active_monthly_party_month_unique"
  ON "party_income" ("party_id", "income_date")
  WHERE "receipt_type" = 'MONTHLY' AND "is_archived" = false;
