import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import { Decimal, ZERO } from "../../lib/domain/money";

export interface CounterIncomeListFilter {
  from: string;
  to: string;
}

/** FR-CINC-01/02/03. Archived rows are excluded from the default list/total, same convention as Daily Expenses. */
export async function listCounterIncome(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  filter: CounterIncomeListFilter,
) {
  requirePermission(currentUser, "entry:counter-income");

  const from = parseCalendarDate(filter.from);
  const to = parseCalendarDate(filter.to);
  if (!from || !to) {
    throw new Error("Invalid date range.");
  }

  const items = await prisma.counterIncome.findMany({
    where: { isArchived: false, incomeDate: { gte: from, lte: to } },
    orderBy: [{ incomeDate: "desc" }, { id: "desc" }],
  });

  const total = items.reduce<Decimal>((sum, item) => sum.plus(item.amount), ZERO);

  return { items, total };
}
