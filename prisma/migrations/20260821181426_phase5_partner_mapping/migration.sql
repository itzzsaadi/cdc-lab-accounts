-- Phase 5: explicit Partner A/B identity mapping for the profit split
-- (app_settings.partner_a_user_id / partner_b_user_id, populated only on
-- the settingKey = 'profit_split' row). Replaces the rejected
-- createdAt-ordering approach — see
-- docs/adr/0007-phase-5-calculations-dashboard-reports.md. Hand-edited
-- per the documented Prisma escape-hatch pattern (CLAUDE.md §20). No
-- earlier migration touched.

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "partner_a_user_id" UUID,
ADD COLUMN     "partner_b_user_id" UUID;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_partner_a_user_id_fkey" FOREIGN KEY ("partner_a_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_partner_b_user_id_fkey" FOREIGN KEY ("partner_b_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Both configured or neither — no partial mapping.
-- ----------------------------------------------------------------------------
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_partner_mapping_both_or_neither"
  CHECK (("partner_a_user_id" IS NULL) = ("partner_b_user_id" IS NULL));

-- ----------------------------------------------------------------------------
-- Never the same user. Written as "a IS NULL OR a IS DISTINCT FROM b" rather
-- than a bare "<>", because "NULL IS DISTINCT FROM NULL" evaluates to FALSE
-- (Postgres treats two NULLs as "not distinct") and a bare inequality would
-- wrongly reject the legitimate both-null state.
-- ----------------------------------------------------------------------------
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_partner_mapping_distinct"
  CHECK ("partner_a_user_id" IS NULL OR "partner_a_user_id" IS DISTINCT FROM "partner_b_user_id");

-- ----------------------------------------------------------------------------
-- Partner eligibility: both columns must reference a users row with
-- is_partner = true — reusing the generic reject_if_not_partner() function
-- Phase 1 already defined, the same way funded_by_user_id/
-- purchased_by_user_id/partner_user_id already do. Deactivation
-- (is_active = false) never clears this mapping — the trigger only checks
-- is_partner, never is_active, and no other code path writes to these
-- columns on deactivation.
-- ----------------------------------------------------------------------------
CREATE TRIGGER "app_settings_partner_a_must_be_partner"
  BEFORE INSERT OR UPDATE ON "app_settings"
  FOR EACH ROW EXECUTE FUNCTION reject_if_not_partner('partner_a_user_id');

CREATE TRIGGER "app_settings_partner_b_must_be_partner"
  BEFORE INSERT OR UPDATE ON "app_settings"
  FOR EACH ROW EXECUTE FUNCTION reject_if_not_partner('partner_b_user_id');
