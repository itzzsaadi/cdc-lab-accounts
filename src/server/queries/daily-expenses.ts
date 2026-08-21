import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import { Decimal, ZERO } from "../../lib/domain/money";

export interface DailyExpenseListFilter {
  from: string;
  to: string;
  expenseItemId?: string;
  fundingSource?: "BUSINESS" | "PARTNER";
}

/**
 * FR-DEXP-07/08. Archived rows are never included in the default listing
 * or its total (archiving *is* this table's "delete", CLAUDE.md §11) — but
 * an archived `expense_item`/`user` that a still-active row references is
 * always shown via the plain Prisma relation include below, with no
 * `isActive` filter on the join itself, so historical wording is never
 * lost (CLAUDE.md §11).
 */
export async function listDailyExpenses(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  filter: DailyExpenseListFilter,
) {
  requirePermission(currentUser, "entry:daily-expense");

  const from = parseCalendarDate(filter.from);
  const to = parseCalendarDate(filter.to);
  if (!from || !to) {
    throw new Error("Invalid date range.");
  }

  const items = await prisma.dailyExpense.findMany({
    where: {
      isArchived: false,
      expenseDate: { gte: from, lte: to },
      ...(filter.expenseItemId ? { expenseItemId: filter.expenseItemId } : {}),
      ...(filter.fundingSource ? { fundingSource: filter.fundingSource } : {}),
    },
    include: {
      expenseItem: { select: { id: true, name: true, isActive: true } },
      fundedBy: { select: { id: true, fullName: true } },
    },
    orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
  });

  const total = items.reduce<Decimal>((sum, item) => sum.plus(item.amount), ZERO);

  return { items, total };
}

/** Active expense items for the create/edit dropdown (FR-DEXP-02/03) — an archived item never appears here, only on an already-existing entry's own display via `listDailyExpenses`'s include above. */
export async function listActiveExpenseItems(prisma: PrismaClient) {
  return prisma.expenseItem.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}
