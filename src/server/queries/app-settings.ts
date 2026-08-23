import type { PrismaClient } from "../../../generated/prisma/client";

export interface ProfitSplitConfig {
  splitAPercent: string;
  splitBPercent: string;
  partnerAUserId: string | null;
  partnerBUserId: string | null;
  partnerAName: string | null;
  partnerBName: string | null;
  /** True only once both partner_a_user_id/partner_b_user_id are set — never inferred from account order. */
  isConfigured: boolean;
}

/**
 * FR-RES-08/BR-10, approved decision (explicit FK mapping, not
 * `createdAt` order). Reads the single `settingKey = 'profit_split'` row;
 * `isConfigured` is what every Monthly Summary/Dashboard caller checks
 * before computing or displaying any split figure — never a fabricated
 * share when the mapping is incomplete.
 *
 * Phase 7: percentages are read from the typed `splitAPercent`/
 * `splitBPercent` Decimal columns, never `settingValue`'s legacy
 * `{partner_a, partner_b}` JSON keys — those are no longer written after
 * the phase7_administration_and_import migration's one-time backfill (see
 * docs/adr/0009-phase-7-administration-and-import.md). The 50/50 fallback
 * below only ever applies before that row exists at all (e.g. a fresh
 * seed with no profit-split row yet), matching the pre-Phase-7 default.
 */
export async function getProfitSplitConfig(prisma: PrismaClient): Promise<ProfitSplitConfig> {
  const row = await prisma.appSetting.findUnique({
    where: { settingKey: "profit_split" },
    include: {
      partnerA: { select: { id: true, fullName: true } },
      partnerB: { select: { id: true, fullName: true } },
    },
  });

  return {
    splitAPercent: row?.splitAPercent?.toString() ?? "50",
    splitBPercent: row?.splitBPercent?.toString() ?? "50",
    partnerAUserId: row?.partnerAUserId ?? null,
    partnerBUserId: row?.partnerBUserId ?? null,
    partnerAName: row?.partnerA?.fullName ?? null,
    partnerBName: row?.partnerB?.fullName ?? null,
    isConfigured: Boolean(row?.partnerAUserId && row?.partnerBUserId),
  };
}

/** Active partners for the initial-mapping picker (Admin-only form). */
export async function listActivePartnersForMapping(prisma: PrismaClient) {
  return prisma.user.findMany({
    where: { isPartner: true, isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
}
