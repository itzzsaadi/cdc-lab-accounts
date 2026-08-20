-- CreateEnum
CREATE TYPE "role" AS ENUM ('OPERATOR', 'PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "billing_mode" AS ENUM ('DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "expense_group" AS ENUM ('ADMIN', 'PURCHASING');

-- CreateEnum
CREATE TYPE "funding_source" AS ENUM ('BUSINESS', 'PARTNER');

-- CreateEnum
CREATE TYPE "asset_classification" AS ENUM ('FIXED', 'MOVABLE');

-- CreateEnum
CREATE TYPE "acquisition_mode" AS ENUM ('INSTALMENT', 'CASH');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "receipt_type" AS ENUM ('DAILY', 'MONTHLY', 'CASH_DIRECT');

-- CreateEnum
CREATE TYPE "contribution_type" AS ENUM ('INITIAL', 'INJECTION', 'DRAWING');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE', 'LOGIN', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'IMPORT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "role" "role" NOT NULL,
    "is_partner" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "billing_mode" "billing_mode" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_items" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "expense_group" "expense_group" NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_expenses" (
    "id" UUID NOT NULL,
    "client_uuid" UUID NOT NULL,
    "expense_date" DATE NOT NULL,
    "expense_item_id" UUID,
    "custom_description" VARCHAR(300),
    "amount" DECIMAL(14,2) NOT NULL,
    "funding_source" "funding_source" NOT NULL,
    "funded_by_user_id" UUID,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "synced_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_expenses" (
    "id" UUID NOT NULL,
    "client_uuid" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "category_id" UUID NOT NULL,
    "vendor_id" UUID,
    "asset_id" UUID,
    "description" VARCHAR(300),
    "amount" DECIMAL(14,2) NOT NULL,
    "funding_source" "funding_source" NOT NULL,
    "funded_by_user_id" UUID,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "synced_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "monthly_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_income" (
    "id" UUID NOT NULL,
    "client_uuid" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "income_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receipt_type" "receipt_type" NOT NULL,
    "note" VARCHAR(300),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "synced_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "party_income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter_income" (
    "id" UUID NOT NULL,
    "client_uuid" UUID NOT NULL,
    "income_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(300),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "synced_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "counter_income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "classification" "asset_classification" NOT NULL,
    "acquisition_mode" "acquisition_mode" NOT NULL,
    "monthly_instalment" DECIMAL(14,2),
    "purchase_price" DECIMAL(14,2),
    "purchased_by_user_id" UUID,
    "vendor_id" UUID,
    "acquired_on" DATE,
    "status" "asset_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_contributions" (
    "id" UUID NOT NULL,
    "partner_user_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "contribution_type" "contribution_type" NOT NULL,
    "note" VARCHAR(500),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "capital_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "action" "audit_action" NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(60) NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "synced_at" TIMESTAMPTZ(6),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "setting_key" VARCHAR(80) NOT NULL,
    "setting_value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("setting_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "parties_name_key" ON "parties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_items_name_key" ON "expense_items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "vendors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "daily_expenses_client_uuid_key" ON "daily_expenses"("client_uuid");

-- CreateIndex
CREATE INDEX "daily_expenses_expense_date_idx" ON "daily_expenses"("expense_date");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_expenses_client_uuid_key" ON "monthly_expenses"("client_uuid");

-- CreateIndex
CREATE INDEX "monthly_expenses_period_month_idx" ON "monthly_expenses"("period_month");

-- CreateIndex
CREATE UNIQUE INDEX "party_income_client_uuid_key" ON "party_income"("client_uuid");

-- CreateIndex
CREATE INDEX "party_income_income_date_idx" ON "party_income"("income_date");

-- CreateIndex
CREATE UNIQUE INDEX "counter_income_client_uuid_key" ON "counter_income"("client_uuid");

-- CreateIndex
CREATE INDEX "counter_income_income_date_idx" ON "counter_income"("income_date");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_expense_item_id_fkey" FOREIGN KEY ("expense_item_id") REFERENCES "expense_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_funded_by_user_id_fkey" FOREIGN KEY ("funded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_funded_by_user_id_fkey" FOREIGN KEY ("funded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_income" ADD CONSTRAINT "party_income_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_income" ADD CONSTRAINT "party_income_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_income" ADD CONSTRAINT "party_income_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_income" ADD CONSTRAINT "counter_income_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_income" ADD CONSTRAINT "counter_income_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_purchased_by_user_id_fkey" FOREIGN KEY ("purchased_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_contributions" ADD CONSTRAINT "capital_contributions_partner_user_id_fkey" FOREIGN KEY ("partner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_contributions" ADD CONSTRAINT "capital_contributions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_contributions" ADD CONSTRAINT "capital_contributions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Hand-authored additions below this line.
-- Not expressible in prisma/schema.prisma's schema language (Prisma 7 has no
-- CHECK-constraint, trigger, or partial-index DSL) — added directly to this
-- versioned migration per the documented Prisma escape-hatch pattern
-- (CLAUDE.md §20). See docs/adr/0002-phase-1-schema-clarifications.md and
-- the Phase 1 plan for the reasoning behind each block.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Monetary CHECK constraints (DR-01, SRS §6 per-table "CHECK > 0"/">= 0")
-- ----------------------------------------------------------------------------

ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "party_income" ADD CONSTRAINT "party_income_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "counter_income" ADD CONSTRAINT "counter_income_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "capital_contributions" ADD CONSTRAINT "capital_contributions_amount_positive" CHECK ("amount" > 0);

-- Recommended additions (not literally spelled out in SRS §6's assets table,
-- but a zero/negative instalment or purchase price is never meaningful):
ALTER TABLE "assets" ADD CONSTRAINT "assets_monthly_instalment_positive" CHECK ("monthly_instalment" IS NULL OR "monthly_instalment" > 0);
ALTER TABLE "assets" ADD CONSTRAINT "assets_purchase_price_positive" CHECK ("purchase_price" IS NULL OR "purchase_price" > 0);

-- ----------------------------------------------------------------------------
-- Funding-source rule (DR-07, BR-02/05/06) — bidirectional exclusivity
-- (approved decision: PARTNER requires the partner named; BUSINESS requires
-- the field null — both directions, not just the SRS's literal one-way text)
-- ----------------------------------------------------------------------------

ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_funding_source_partner_check"
  CHECK (("funding_source" = 'PARTNER') = ("funded_by_user_id" IS NOT NULL));

ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_funding_source_partner_check"
  CHECK (("funding_source" = 'PARTNER') = ("funded_by_user_id" IS NOT NULL));

-- ----------------------------------------------------------------------------
-- Asset acquisition-mode rule (DR-08, FR-AST-07, BR-08/09) — INSTALMENT and
-- CASH are mutually exclusive and each requires its own set of columns.
-- ----------------------------------------------------------------------------

ALTER TABLE "assets" ADD CONSTRAINT "assets_acquisition_mode_check" CHECK (
  ("acquisition_mode" = 'INSTALMENT' AND "monthly_instalment" IS NOT NULL AND "purchase_price" IS NULL AND "purchased_by_user_id" IS NULL)
  OR
  ("acquisition_mode" = 'CASH' AND "purchase_price" IS NOT NULL AND "purchased_by_user_id" IS NOT NULL AND "monthly_instalment" IS NULL)
);

-- ----------------------------------------------------------------------------
-- Instalment idempotency (new in Revision 2/3 of the Phase 1 plan): at most
-- one *active* instalment row per asset per month, while archive-then-
-- correct history is preserved (archived rows fall outside this index).
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX "monthly_expenses_active_instalment_per_asset_month"
  ON "monthly_expenses" ("asset_id", "period_month")
  WHERE "asset_id" IS NOT NULL AND "is_archived" = false;

-- ----------------------------------------------------------------------------
-- Partner-eligibility enforcement (approved decision): funded_by_user_id,
-- purchased_by_user_id, and capital_contributions.partner_user_id must all
-- reference a users row with is_partner = true. One generic trigger
-- function, reused across every call site, per CON-07's simplicity mandate.
-- ----------------------------------------------------------------------------

CREATE FUNCTION reject_if_not_partner() RETURNS TRIGGER AS $$
DECLARE
  col_name TEXT := TG_ARGV[0];
  referenced_user_id UUID;
  referenced_is_partner BOOLEAN;
BEGIN
  EXECUTE format('SELECT ($1).%I', col_name) USING NEW INTO referenced_user_id;

  IF referenced_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "is_partner" INTO referenced_is_partner FROM "users" WHERE "id" = referenced_user_id;

  IF referenced_is_partner IS NOT TRUE THEN
    RAISE EXCEPTION 'Column % on table % must reference a users row with is_partner = true (got user %)',
      col_name, TG_TABLE_NAME, referenced_user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "daily_expenses_funded_by_must_be_partner"
  BEFORE INSERT OR UPDATE ON "daily_expenses"
  FOR EACH ROW EXECUTE FUNCTION reject_if_not_partner('funded_by_user_id');

CREATE TRIGGER "monthly_expenses_funded_by_must_be_partner"
  BEFORE INSERT OR UPDATE ON "monthly_expenses"
  FOR EACH ROW EXECUTE FUNCTION reject_if_not_partner('funded_by_user_id');

CREATE TRIGGER "assets_purchased_by_must_be_partner"
  BEFORE INSERT OR UPDATE ON "assets"
  FOR EACH ROW EXECUTE FUNCTION reject_if_not_partner('purchased_by_user_id');

CREATE TRIGGER "capital_contributions_partner_must_be_partner"
  BEFORE INSERT OR UPDATE ON "capital_contributions"
  FOR EACH ROW EXECUTE FUNCTION reject_if_not_partner('partner_user_id');

-- ----------------------------------------------------------------------------
-- Audit log append-only enforcement (FR-AUD-03, DR-03/DR-04 spirit) — no
-- UPDATE or DELETE is ever permitted against audit_log, at the database
-- level, unconditionally.
-- ----------------------------------------------------------------------------

CREATE FUNCTION audit_log_reject_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

-- ----------------------------------------------------------------------------
-- Physical-deletion prevention (BR-15, DR-04, CON-04) — every business,
-- financial, master-data, settings, user, and audit table rejects a
-- physical DELETE unconditionally; "removal" is archiving only. audit_log
-- is already covered by the trigger immediately above (BEFORE UPDATE OR
-- DELETE), so it is not repeated here.
-- ----------------------------------------------------------------------------

CREATE FUNCTION reject_physical_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Physical deletion of rows in % is not permitted; archive instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_no_physical_delete" BEFORE DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "parties_no_physical_delete" BEFORE DELETE ON "parties" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "expense_items_no_physical_delete" BEFORE DELETE ON "expense_items" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "expense_categories_no_physical_delete" BEFORE DELETE ON "expense_categories" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "vendors_no_physical_delete" BEFORE DELETE ON "vendors" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "daily_expenses_no_physical_delete" BEFORE DELETE ON "daily_expenses" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "monthly_expenses_no_physical_delete" BEFORE DELETE ON "monthly_expenses" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "party_income_no_physical_delete" BEFORE DELETE ON "party_income" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "counter_income_no_physical_delete" BEFORE DELETE ON "counter_income" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "assets_no_physical_delete" BEFORE DELETE ON "assets" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "capital_contributions_no_physical_delete" BEFORE DELETE ON "capital_contributions" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
CREATE TRIGGER "app_settings_no_physical_delete" BEFORE DELETE ON "app_settings" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
