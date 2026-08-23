import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { Decimal } from "../../lib/domain/money";
import {
  configurePartnerMappingSchema,
  updateProfitSplitSchema,
} from "../../lib/validation/app-settings";

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
        settingValue: {},
        splitAPercent: new Decimal(50),
        splitBPercent: new Decimal(50),
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

/**
 * FR-MST-06. The server never trusts a submitted "sums to 100" total —
 * it recomputes the sum itself via `Decimal` (never a native `number`)
 * and refuses anything that doesn't land on exactly 100 before ever
 * reaching the database's own CHECK constraint
 * (app_settings_profit_split_valid, phase7_administration_and_import
 * migration), which remains the final authority regardless. Never
 * touches partnerAUserId/partnerBUserId — that mapping stays exactly as
 * `configurePartnerMapping` set it, write-once, per the approved Phase 7
 * decision to keep Partner A/B identity fixed.
 *
 * No retroactive stored-result rewriting: nothing here writes a profit/
 * split figure anywhere — the new percentages simply become what every
 * future *and past* period's live calculation reads (DR-09 — no period
 * ever had a stored result to begin with). The caller-facing UI must
 * disclose this plainly, not describe it as "future periods only."
 */
export async function updateProfitSplit(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "profit-split:manage");

  const parsed = updateProfitSplitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const splitA = new Decimal(parsed.data.splitAPercent);
  const splitB = new Decimal(parsed.data.splitBPercent);
  if (!splitA.plus(splitB).equals(100)) {
    return { ok: false, error: "The two percentages must add up to exactly 100." };
  }
  if (
    splitA.lessThan(0) ||
    splitA.greaterThan(100) ||
    splitB.lessThan(0) ||
    splitB.greaterThan(100)
  ) {
    return { ok: false, error: "Each percentage must be between 0 and 100." };
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.appSetting.findUnique({ where: { settingKey: "profit_split" } });
    await tx.appSetting.upsert({
      where: { settingKey: "profit_split" },
      create: {
        settingKey: "profit_split",
        settingValue: {},
        splitAPercent: splitA,
        splitBPercent: splitB,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
      update: {
        splitAPercent: splitA,
        splitBPercent: splitB,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "app_setting",
      entityId: "profit_split",
      oldValues: existing
        ? {
            splitAPercent: existing.splitAPercent?.toString(),
            splitBPercent: existing.splitBPercent?.toString(),
          }
        : undefined,
      newValues: { splitAPercent: splitA.toString(), splitBPercent: splitB.toString() },
    });
    return { ok: true };
  });
}
