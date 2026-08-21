import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { configurePartnerMappingSchema } from "../../lib/validation/app-settings";

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * FR-RES-08's approved narrow Admin-only initial-setup action
 * (`profit-split:configure-partners`, distinct from Phase 7's
 * `profit-split:manage`, which will later edit the percentages). Deliberately
 * **write-once**: refuses once both `partner_a_user_id`/`partner_b_user_id`
 * are already set, so this action is only ever the initial configuration
 * step, never a way to silently reassign an established mapping — later
 * re-mapping is Phase 7 settings-screen scope, not built here. Distinctness
 * and partner-eligibility are re-enforced by the database's own CHECK
 * constraints and the `reject_if_not_partner` trigger regardless of this
 * check.
 */
export async function configurePartnerMapping(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "profit-split:configure-partners");

  const parsed = configurePartnerMappingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.appSetting.findUnique({ where: { settingKey: "profit_split" } });
    if (existing?.partnerAUserId && existing?.partnerBUserId) {
      return {
        ok: false,
        error: "The partner mapping is already configured and cannot be changed here.",
      };
    }

    // `upsert`, not `update` — the seed script normally creates this row
    // (default 50/50 split) before any Phase 5 code runs, but this must
    // not assume that already happened (e.g. a truncated test database).
    await tx.appSetting.upsert({
      where: { settingKey: "profit_split" },
      create: {
        settingKey: "profit_split",
        settingValue: { partner_a: 50, partner_b: 50 },
        partnerAUserId: data.partnerAUserId,
        partnerBUserId: data.partnerBUserId,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
      update: {
        partnerAUserId: data.partnerAUserId,
        partnerBUserId: data.partnerBUserId,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "app_setting",
      entityId: "profit_split",
      oldValues: {
        partnerAUserId: existing?.partnerAUserId ?? null,
        partnerBUserId: existing?.partnerBUserId ?? null,
      },
      newValues: { partnerAUserId: data.partnerAUserId, partnerBUserId: data.partnerBUserId },
    });
    return { ok: true };
  });
}
