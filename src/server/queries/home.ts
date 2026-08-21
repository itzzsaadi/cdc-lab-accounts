import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";

export interface RecentEntry {
  id: string;
  kind: "daily-expense" | "party-income" | "cash-receipt" | "counter-income";
  label: string;
  amount: string;
  capturedAt: string;
}

/**
 * Operator Home's real "recent entries" (mandatory implementation
 * safeguard #7 wording correction — no status column, no pending-uploads
 * tile, no fabricated sync state; the Stitch export's demo markup for
 * those is explicitly not reproduced here). Ordered by
 * `captured_at DESC, id DESC` across all four entry kinds, merged and
 * re-sliced to `limit` — never a per-table `take` shown independently,
 * so a burst of one entry kind can't crowd the other three out of view
 * incorrectly (each table is over-fetched by `limit` first, then the
 * true global top-`limit` is taken after merging).
 */
export async function listRecentEntries(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  limit = 10,
): Promise<RecentEntry[]> {
  requirePermission(currentUser, "entry:daily-expense");

  const [expenses, partyIncome, counterIncome] = await Promise.all([
    prisma.dailyExpense.findMany({
      where: { isArchived: false },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { expenseItem: { select: { name: true } } },
    }),
    prisma.partyIncome.findMany({
      where: { isArchived: false },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { party: { select: { name: true } } },
    }),
    prisma.counterIncome.findMany({
      where: { isArchived: false },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      take: limit,
    }),
  ]);

  const merged: RecentEntry[] = [
    ...expenses.map((entry) => ({
      id: entry.id,
      kind: "daily-expense" as const,
      label: entry.expenseItem?.name ?? entry.customDescription ?? "Daily expense",
      amount: entry.amount.toString(),
      capturedAt: entry.capturedAt.toISOString(),
    })),
    ...partyIncome.map((entry) => ({
      id: entry.id,
      kind: (entry.receiptType === "CASH_DIRECT" ? "cash-receipt" : "party-income") as
        "cash-receipt" | "party-income",
      label: entry.party.name,
      amount: entry.amount.toString(),
      capturedAt: entry.capturedAt.toISOString(),
    })),
    ...counterIncome.map((entry) => ({
      id: entry.id,
      kind: "counter-income" as const,
      label: "Counter income",
      amount: entry.amount.toString(),
      capturedAt: entry.capturedAt.toISOString(),
    })),
  ];

  merged.sort((a, b) => {
    const byTime = b.capturedAt.localeCompare(a.capturedAt);
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
  });

  return merged.slice(0, limit);
}
