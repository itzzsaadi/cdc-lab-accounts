import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { parseCalendarDate, monthBounds, previousYearMonth } from "../../lib/domain/calendar-date";
import { Decimal, ZERO } from "../../lib/domain/money";
import { splitProfit } from "../../lib/domain/profit-split";
import { getProfitSplitConfig } from "./app-settings";

export interface MonthlyResultTotals {
  from: string;
  to: string;
  totalCounterIncome: string;
  totalPartyIncome: string;
  totalIncome: string;
  dailyExpenseTotal: string;
  dailyExpenseBusinessTotal: string;
  monthlyExpenseBusinessTotal: string;
  totalExpenses: string;
  netResult: string;
  split: {
    isConfigured: boolean;
    partnerAName: string | null;
    partnerBName: string | null;
    splitAPercent: string;
    splitBPercent: string;
    shareA: string | null;
    shareB: string | null;
  };
}

/** `monthly_expenses.period_month`/`party_income` MONTHLY rows are anchored to the first day of a month, not a specific day — a custom sub-month range still includes every month it touches, in full. */
function monthTruncate(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

/**
 * FR-RES-04 to 08. Every sum is a Postgres-side `aggregate` (`SUM`), never
 * a Node-side `reduce` over fetched rows — required for NFR-PERF-04 at
 * realistic data volumes (`docs/adr/0007-...md`). No permission check
 * here: this is the shared computation both `getMonthlyResultTotals`
 * (Monthly Summary, `report:financial-summary`) and the Dashboard query
 * (`report:dashboard`) call, each behind its own gate — never exported to
 * a route/action directly.
 */
export async function computeMonthlyResultTotals(
  prisma: PrismaClient,
  range: { from: string; to: string },
): Promise<MonthlyResultTotals> {
  const fromDate = parseCalendarDate(range.from)!;
  const toDate = parseCalendarDate(range.to)!;
  const monthFromDate = parseCalendarDate(monthTruncate(range.from))!;
  const monthToDate = parseCalendarDate(monthTruncate(range.to))!;

  const [
    counterAgg,
    partyDayAgg,
    partyMonthAgg,
    dailyAllAgg,
    dailyBusinessAgg,
    monthlyBusinessAgg,
  ] = await Promise.all([
    prisma.counterIncome.aggregate({
      _sum: { amount: true },
      where: { isArchived: false, incomeDate: { gte: fromDate, lte: toDate } },
    }),
    prisma.partyIncome.aggregate({
      _sum: { amount: true },
      where: {
        isArchived: false,
        receiptType: { in: ["DAILY", "CASH_DIRECT"] },
        incomeDate: { gte: fromDate, lte: toDate },
      },
    }),
    prisma.partyIncome.aggregate({
      _sum: { amount: true },
      where: {
        isArchived: false,
        receiptType: "MONTHLY",
        incomeDate: { gte: monthFromDate, lte: monthToDate },
      },
    }),
    prisma.dailyExpense.aggregate({
      _sum: { amount: true },
      where: { isArchived: false, expenseDate: { gte: fromDate, lte: toDate } },
    }),
    prisma.dailyExpense.aggregate({
      _sum: { amount: true },
      where: {
        isArchived: false,
        fundingSource: "BUSINESS",
        expenseDate: { gte: fromDate, lte: toDate },
      },
    }),
    prisma.monthlyExpense.aggregate({
      _sum: { amount: true },
      where: {
        isArchived: false,
        fundingSource: "BUSINESS",
        periodMonth: { gte: monthFromDate, lte: monthToDate },
      },
    }),
  ]);

  const totalCounterIncome: Decimal = counterAgg._sum.amount ?? ZERO;
  const totalPartyIncome = (partyDayAgg._sum.amount ?? ZERO).plus(
    partyMonthAgg._sum.amount ?? ZERO,
  );
  const totalIncome = totalCounterIncome.plus(totalPartyIncome);

  const dailyExpenseTotal: Decimal = dailyAllAgg._sum.amount ?? ZERO;
  const dailyExpenseBusinessTotal: Decimal = dailyBusinessAgg._sum.amount ?? ZERO;
  const monthlyExpenseBusinessTotal: Decimal = monthlyBusinessAgg._sum.amount ?? ZERO;
  const totalExpenses = dailyExpenseBusinessTotal.plus(monthlyExpenseBusinessTotal);
  const netResult = totalIncome.minus(totalExpenses);

  const splitConfig = await getProfitSplitConfig(prisma);
  let shareA: string | null = null;
  let shareB: string | null = null;
  if (splitConfig.isConfigured) {
    const split = splitProfit({
      splitAPercent: new Decimal(splitConfig.splitAPercent),
      netResult,
    });
    shareA = split.shareA.toString();
    shareB = split.shareB.toString();
  }

  return {
    from: range.from,
    to: range.to,
    totalCounterIncome: totalCounterIncome.toString(),
    totalPartyIncome: totalPartyIncome.toString(),
    totalIncome: totalIncome.toString(),
    dailyExpenseTotal: dailyExpenseTotal.toString(),
    dailyExpenseBusinessTotal: dailyExpenseBusinessTotal.toString(),
    monthlyExpenseBusinessTotal: monthlyExpenseBusinessTotal.toString(),
    totalExpenses: totalExpenses.toString(),
    netResult: netResult.toString(),
    split: {
      isConfigured: splitConfig.isConfigured,
      partnerAName: splitConfig.partnerAName,
      partnerBName: splitConfig.partnerBName,
      splitAPercent: splitConfig.splitAPercent,
      splitBPercent: splitConfig.splitBPercent,
      shareA,
      shareB,
    },
  };
}

export async function getMonthlyResultTotals(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  range: { from: string; to: string },
): Promise<MonthlyResultTotals> {
  requirePermission(currentUser, "report:financial-summary");
  return computeMonthlyResultTotals(prisma, range);
}

export interface MonthlyTrendPoint {
  month: string;
  totalIncome: string;
  totalExpenses: string;
  netResult: string;
}

/**
 * Dashboard trend data (FR-DASH's "current vs previous month" + trend
 * chart) — `monthsBack` whole calendar months ending at `currentMonth`,
 * each computed through the same `computeMonthlyResultTotals` aggregate
 * path as Monthly Summary, never a separate/duplicated calculation.
 * Gated on `report:dashboard`, distinct from `report:financial-summary`,
 * since the Dashboard and Monthly Summary screens are independent
 * permission surfaces even though they share the underlying computation.
 */
export async function getDashboardTrend(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  currentMonth: string,
  monthsBack = 6,
): Promise<MonthlyTrendPoint[]> {
  requirePermission(currentUser, "report:dashboard");

  const months: string[] = [];
  let cursor = currentMonth;
  for (let i = 0; i < monthsBack; i += 1) {
    months.unshift(cursor);
    cursor = previousYearMonth(cursor);
  }

  return Promise.all(
    months.map(async (month) => {
      const bounds = monthBounds(month);
      const totals = await computeMonthlyResultTotals(prisma, {
        from: bounds.firstDay,
        to: bounds.lastDay,
      });
      return {
        month,
        totalIncome: totals.totalIncome,
        totalExpenses: totals.totalExpenses,
        netResult: totals.netResult,
      };
    }),
  );
}

export interface ItemizedCategoryLine {
  categoryId: string;
  categoryName: string;
  categoryActive: boolean;
  amount: string;
  /** BR-07/FR-RES-06: a partner-funded line is excluded from every total on this screen (it never touches `totalExpenses`/`netResult`) but must still be visible here, by category, so spending never disappears from view — it is never silently dropped from this breakdown. */
  fundingSource: "BUSINESS" | "PARTNER";
}

/** FR-RES-09/10/BR-07: the itemised Administration/Purchasing breakdown, same shape as `listMonthlyExpenses` but summed across every month the range touches. Includes both funding sources — a category with only `BUSINESS` rows this period yields one line as before; one with `PARTNER` rows yields a separately-tagged line alongside it, never folded into the business figure the headline total reconciles against. */
export async function getItemizedExpenseBreakdown(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  range: { from: string; to: string },
): Promise<{ administration: ItemizedCategoryLine[]; purchasing: ItemizedCategoryLine[] }> {
  requirePermission(currentUser, "report:financial-summary");

  const monthFromDate = parseCalendarDate(monthTruncate(range.from))!;
  const monthToDate = parseCalendarDate(monthTruncate(range.to))!;

  const grouped = await prisma.monthlyExpense.groupBy({
    by: ["categoryId", "fundingSource"],
    _sum: { amount: true },
    where: {
      isArchived: false,
      periodMonth: { gte: monthFromDate, lte: monthToDate },
    },
  });
  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId) } },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const administration: ItemizedCategoryLine[] = [];
  const purchasing: ItemizedCategoryLine[] = [];
  for (const row of grouped) {
    const category = categoryById.get(row.categoryId);
    if (!category) continue;
    const line: ItemizedCategoryLine = {
      categoryId: row.categoryId,
      categoryName: category.name,
      categoryActive: category.isActive,
      amount: (row._sum.amount ?? ZERO).toString(),
      fundingSource: row.fundingSource,
    };
    (category.expenseGroup === "ADMIN" ? administration : purchasing).push(line);
  }
  const byNameThenSource = (a: ItemizedCategoryLine, b: ItemizedCategoryLine) =>
    a.categoryName.localeCompare(b.categoryName) || a.fundingSource.localeCompare(b.fundingSource);
  administration.sort(byNameThenSource);
  purchasing.sort(byNameThenSource);

  return { administration, purchasing };
}
