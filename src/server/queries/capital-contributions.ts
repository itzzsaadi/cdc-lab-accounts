import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { Decimal, ZERO } from "../../lib/domain/money";
import { partnerInvestmentTotal } from "../../lib/domain/investment";

export async function listActivePartners(prisma: PrismaClient) {
  return prisma.user.findMany({
    where: { isPartner: true, isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
}

export interface InvestmentStatementItem {
  date: string;
  type: "INITIAL" | "INJECTION" | "DRAWING" | "PARTNER_EXPENSE" | "CASH_ASSET";
  description: string;
  amount: string;
  runningBalance: string;
}

export interface PartnerInvestmentStatement {
  partnerId: string;
  fullName: string;
  items: InvestmentStatementItem[];
  total: string;
}

/**
 * FR-INV-01/02/05. Every partner who has ever appeared in a contribution,
 * partner-funded expense, or cash asset (plus every currently-active
 * partner, so a partner with no activity yet still gets an empty
 * statement) — never just the active-partner list alone, since a
 * deactivated partner's historical figures must still display (CLAUDE.md
 * §11). Reuses `partnerInvestmentTotal` (unchanged since Phase 1) for the
 * authoritative total; the running balance shown per row is derived the
 * same way, applied incrementally in chronological order, purely for
 * itemised display — never a stored figure (DR-09).
 */
export async function getPartnerInvestmentStatements(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
): Promise<PartnerInvestmentStatement[]> {
  requirePermission(currentUser, "investment:view");

  const [contributions, fundedDaily, fundedMonthly, cashAssets, allPartners] = await Promise.all([
    prisma.capitalContribution.findMany({ where: { isArchived: false } }),
    prisma.dailyExpense.findMany({
      where: { isArchived: false, fundingSource: "PARTNER" },
      select: {
        fundedByUserId: true,
        amount: true,
        expenseDate: true,
        expenseItemId: true,
        customDescription: true,
        expenseItem: { select: { name: true } },
      },
    }),
    prisma.monthlyExpense.findMany({
      where: { isArchived: false, fundingSource: "PARTNER" },
      select: {
        fundedByUserId: true,
        amount: true,
        periodMonth: true,
        category: { select: { name: true } },
      },
    }),
    prisma.asset.findMany({
      where: { acquisitionMode: "CASH", purchasedByUserId: { not: null } },
      select: { purchasedByUserId: true, purchasePrice: true, acquiredOn: true, name: true },
    }),
    prisma.user.findMany({
      where: { isPartner: true },
      select: { id: true, fullName: true, isActive: true },
    }),
  ]);

  const partnerIds = new Set<string>(allPartners.map((p) => p.id));

  const partners = allPartners.slice().sort((a, b) => a.fullName.localeCompare(b.fullName));

  return Array.from(partnerIds)
    .map((partnerId) => partners.find((p) => p.id === partnerId)!)
    .filter(Boolean)
    .map((partner) => {
      const rows: {
        date: string;
        type: InvestmentStatementItem["type"];
        description: string;
        signed: Decimal;
      }[] = [];

      for (const c of contributions) {
        if (c.partnerUserId !== partner.id) continue;
        rows.push({
          date: c.entryDate.toISOString().slice(0, 10),
          type: c.contributionType,
          description:
            c.note ?? (c.contributionType === "DRAWING" ? "Withdrawal" : "Capital contribution"),
          signed: c.contributionType === "DRAWING" ? c.amount.negated() : c.amount,
        });
      }
      for (const e of fundedDaily) {
        if (e.fundedByUserId !== partner.id) continue;
        rows.push({
          date: e.expenseDate.toISOString().slice(0, 10),
          type: "PARTNER_EXPENSE",
          description: e.expenseItem?.name ?? e.customDescription ?? "Daily expense",
          signed: e.amount,
        });
      }
      for (const e of fundedMonthly) {
        if (e.fundedByUserId !== partner.id) continue;
        rows.push({
          date: e.periodMonth.toISOString().slice(0, 10),
          type: "PARTNER_EXPENSE",
          description: e.category.name,
          signed: e.amount,
        });
      }
      for (const a of cashAssets) {
        if (a.purchasedByUserId !== partner.id) continue;
        rows.push({
          date: (a.acquiredOn ?? new Date(0)).toISOString().slice(0, 10),
          type: "CASH_ASSET",
          description: a.name,
          signed: a.purchasePrice!,
        });
      }

      rows.sort((a, b) => a.date.localeCompare(b.date));

      let running = ZERO;
      const items: InvestmentStatementItem[] = rows.map((row) => {
        running = running.plus(row.signed);
        return {
          date: row.date,
          type: row.type,
          description: row.description,
          amount: row.signed.abs().toString(),
          runningBalance: running.toString(),
        };
      });

      const total = partnerInvestmentTotal(
        partner.id,
        contributions.map((c) => ({
          partnerUserId: c.partnerUserId,
          amount: c.amount,
          contributionType: c.contributionType,
        })),
        [...fundedDaily, ...fundedMonthly].map((e) => ({
          fundedByUserId: e.fundedByUserId,
          amount: e.amount,
        })),
        cashAssets.map((a) => ({
          purchasedByUserId: a.purchasedByUserId,
          purchasePrice: a.purchasePrice!,
        })),
      );

      return { partnerId: partner.id, fullName: partner.fullName, items, total: total.toString() };
    });
}
