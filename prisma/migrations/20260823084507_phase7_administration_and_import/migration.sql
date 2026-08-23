-- CreateEnum
CREATE TYPE "import_batch_status" AS ENUM ('PENDING', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "import_session_status" AS ENUM ('PENDING', 'CLAIMED', 'COMMITTED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "split_a_percent" DECIMAL(5,2),
ADD COLUMN     "split_b_percent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "expense_categories" ADD COLUMN     "updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "expense_items" ADD COLUMN     "updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "updated_by" UUID;

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "status" "import_batch_status" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "result_summary" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_sessions" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "file_bytes" BYTEA,
    "status" "import_session_status" NOT NULL DEFAULT 'PENDING',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "claimed_at" TIMESTAMPTZ(6),

    CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_file_hash_idx" ON "import_batches"("file_hash");

-- CreateIndex
CREATE INDEX "import_sessions_expires_at_idx" ON "import_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Phase 7 hand-written additions (not expressible in Prisma's schema DSL —
-- CLAUDE.md §20 escape hatch, same pattern every prior migration in this
-- project uses). See docs/adr/0009-phase-7-administration-and-import.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Master-data name normalization preflight (mandatory correction #4).
-- A functional unique index on lower(btrim(name)) cannot be created over
-- pre-existing normalized duplicates — refuse clearly, by hand, rather than
-- let CREATE UNIQUE INDEX fail with an opaque constraint-violation error.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  dup RECORD;
  found_dups TEXT := '';
BEGIN
  FOR dup IN
    SELECT 'parties' AS tbl, lower(btrim(name)) AS norm, count(*) AS c
      FROM parties GROUP BY lower(btrim(name)) HAVING count(*) > 1
    UNION ALL
    SELECT 'expense_items', lower(btrim(name)), count(*)
      FROM expense_items GROUP BY lower(btrim(name)) HAVING count(*) > 1
    UNION ALL
    SELECT 'expense_categories', lower(btrim(name)), count(*)
      FROM expense_categories GROUP BY lower(btrim(name)) HAVING count(*) > 1
    UNION ALL
    SELECT 'vendors', lower(btrim(name)), count(*)
      FROM vendors GROUP BY lower(btrim(name)) HAVING count(*) > 1
  LOOP
    found_dups := found_dups || format('%s: "%s" (%s rows); ', dup.tbl, dup.norm, dup.c);
  END LOOP;

  IF found_dups <> '' THEN
    RAISE EXCEPTION 'phase7_administration_and_import preflight failed: normalized (trim+lowercase) duplicate names already exist and must be resolved by hand before this migration can run: %', found_dups;
  END IF;
END $$;

-- Backfill: normalize what is already stored so it always matches what the
-- new index and every future edit's validation will enforce (application
-- code trims before saving from here on — see lib/validation/master-data.ts).
UPDATE "parties" SET "name" = btrim("name") WHERE "name" <> btrim("name");
UPDATE "expense_items" SET "name" = btrim("name") WHERE "name" <> btrim("name");
UPDATE "expense_categories" SET "name" = btrim("name") WHERE "name" <> btrim("name");
UPDATE "vendors" SET "name" = btrim("name") WHERE "name" <> btrim("name");

-- Replace each plain, case-sensitive unique index with a functional index on
-- lower(btrim(name)) — case-insensitive and whitespace-insensitive, across
-- active AND archived rows (archiving never frees a name for reuse, per
-- FR-MST-05's historical-integrity spirit).
DROP INDEX "parties_name_key";
CREATE UNIQUE INDEX "parties_name_normalized_unique" ON "parties" ((lower(btrim("name"))));

DROP INDEX "expense_items_name_key";
CREATE UNIQUE INDEX "expense_items_name_normalized_unique" ON "expense_items" ((lower(btrim("name"))));

DROP INDEX "expense_categories_name_key";
CREATE UNIQUE INDEX "expense_categories_name_normalized_unique" ON "expense_categories" ((lower(btrim("name"))));

DROP INDEX "vendors_name_key";
CREATE UNIQUE INDEX "vendors_name_normalized_unique" ON "vendors" ((lower(btrim("name"))));

-- ----------------------------------------------------------------------------
-- 2. Profit-split: backfill the new typed columns from the legacy JSONB
-- shape, preflight-check the result, then enforce non-null/range/sum=100
-- at the database level (mandatory correction #5). Application code stops
-- reading/writing settingValue's partner_a/partner_b keys after this
-- migration — see docs/adr/0009-phase-7-administration-and-import.md.
-- ----------------------------------------------------------------------------
UPDATE "app_settings"
SET "split_a_percent" = ("setting_value"->>'partner_a')::DECIMAL(5,2),
    "split_b_percent" = ("setting_value"->>'partner_b')::DECIMAL(5,2)
WHERE "setting_key" = 'profit_split' AND "split_a_percent" IS NULL;

DO $$
DECLARE
  row_a DECIMAL(5,2);
  row_b DECIMAL(5,2);
BEGIN
  SELECT "split_a_percent", "split_b_percent" INTO row_a, row_b
    FROM "app_settings" WHERE "setting_key" = 'profit_split';
  IF FOUND THEN
    IF row_a IS NULL OR row_b IS NULL
       OR row_a < 0 OR row_a > 100 OR row_b < 0 OR row_b > 100
       OR row_a + row_b <> 100 THEN
      RAISE EXCEPTION 'phase7_administration_and_import preflight failed: existing profit_split row does not satisfy split_a_percent/split_b_percent in [0,100] summing to 100 (got a=%, b=%) — resolve by hand before this migration can run.', row_a, row_b;
    END IF;
  END IF;
END $$;

ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_profit_split_valid"
  CHECK (
    "setting_key" <> 'profit_split'
    OR (
      "split_a_percent" IS NOT NULL AND "split_b_percent" IS NOT NULL
      AND "split_a_percent" >= 0 AND "split_a_percent" <= 100
      AND "split_b_percent" >= 0 AND "split_b_percent" <= 100
      AND "split_a_percent" + "split_b_percent" = 100
    )
  );

-- ----------------------------------------------------------------------------
-- 3. User-administration concurrency and authorization safety (mandatory
-- correction #3). Each guard is a database trigger, not an app-layer
-- count-then-update — a raw SQL statement against `users` is covered too,
-- not just the Server Actions this phase adds.
-- ----------------------------------------------------------------------------

-- Last-active-Admin protection: covers BOTH deactivation and role
-- downgrade, in one trigger. Concurrency-safe via SELECT ... FOR UPDATE,
-- which locks every *other* active-Admin row for the duration of this
-- transaction — a concurrent attempt to demote a different admin at the
-- same moment either serializes behind this lock or is caught by
-- Postgres's own deadlock detector (an acceptable, standard outcome: one
-- transaction aborts and can be retried against the now-consistent state,
-- rather than two transactions each independently "seeing" a safe count
-- and both committing an unsafe result).
CREATE FUNCTION reject_unsafe_admin_change() RETURNS TRIGGER AS $$
DECLARE
  remaining_active_admins INTEGER;
BEGIN
  IF OLD."role" = 'ADMIN' AND (NEW."role" <> 'ADMIN' OR NEW."is_active" = false) THEN
    PERFORM 1 FROM "users"
      WHERE "role" = 'ADMIN' AND "is_active" = true AND "id" <> OLD."id"
      FOR UPDATE;
    SELECT count(*) INTO remaining_active_admins
      FROM "users"
      WHERE "role" = 'ADMIN' AND "is_active" = true AND "id" <> OLD."id";
    IF remaining_active_admins = 0 THEN
      RAISE EXCEPTION 'Cannot % the last active Admin (user %) — at least one active Admin must remain.',
        (CASE WHEN NEW."role" <> 'ADMIN' THEN 'change the role of' ELSE 'deactivate' END), OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_last_admin_protection"
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION reject_unsafe_admin_change();

-- Partner-flag removal vs. an active profit-split mapping: reuses the same
-- generic-trigger-function philosophy Phase 1/5 already established
-- (reject_if_not_partner) — this is the mirror case, guarding against
-- removing eligibility out from under an existing reference rather than
-- guarding a new reference.
CREATE FUNCTION reject_partner_flag_removal_if_mapped() RETURNS TRIGGER AS $$
DECLARE
  mapped_count INTEGER;
BEGIN
  IF OLD."is_partner" = true AND NEW."is_partner" = false THEN
    SELECT count(*) INTO mapped_count FROM "app_settings"
      WHERE "setting_key" = 'profit_split'
        AND ("partner_a_user_id" = OLD."id" OR "partner_b_user_id" = OLD."id");
    IF mapped_count > 0 THEN
      RAISE EXCEPTION 'Cannot remove partner status from user %: they are configured as Partner A or B in the profit split mapping.', OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_partner_flag_removal_guard"
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION reject_partner_flag_removal_if_mapped();

-- Session revocation on any authorization-affecting change — a database
-- guarantee, not just something this phase's own Server Actions remember
-- to do. cookieCache stays disabled (src/server/auth.ts), so every request
-- re-validates against this table; deleting the rows here is immediately
-- effective, not eventually consistent.
CREATE FUNCTION revoke_sessions_on_authorization_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."role" IS DISTINCT FROM OLD."role"
     OR NEW."is_partner" IS DISTINCT FROM OLD."is_partner"
     OR NEW."is_active" IS DISTINCT FROM OLD."is_active" THEN
    DELETE FROM "sessions" WHERE "user_id" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_revoke_sessions_on_authorization_change"
  AFTER UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION revoke_sessions_on_authorization_change();

-- ----------------------------------------------------------------------------
-- 4. import_batches is the durable, append-only import history (mandatory
-- correction #2) — physically delete-protected like every other business/
-- audit record, reusing the existing reject_physical_delete() function.
-- import_sessions is deliberately NOT covered (ephemeral upload
-- infrastructure, same category as sessions/account/verification/
-- sync_operations — see its model comment in schema.prisma).
-- ----------------------------------------------------------------------------
CREATE TRIGGER "import_batches_no_physical_delete" BEFORE DELETE ON "import_batches" FOR EACH ROW EXECUTE FUNCTION reject_physical_delete();
