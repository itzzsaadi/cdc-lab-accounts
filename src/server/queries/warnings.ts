import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { parseCalendarDate, previousYearMonth } from "../../lib/domain/calendar-date";
import { Decimal, ZERO } from "../../lib/domain/money";
import { listInstalmentGenerationCandidates } from "./monthly-expenses";

export interface MissingRecurringCategory {
  categoryId: string;
  categoryName: string;
}

/** FR-WARN-01: every recurring, active category with no live row this month — unlike Phase 4's `listRecurringPrefillCandidates`, this deliberately includes a category with no prior-month row to pre-fill from either, since a warning must catch a first-time omission too. */
export async function listMissingRecurringCategories(
  prisma: PrismaClient,
  periodMonth: string,
): Promise<MissingRecurringCategory[]> {
  const periodMonthDate = parseCalendarDate(`${periodMonth}-01`)!;

  const recurringCategories = await prisma.expenseCategory.findMany({
    where: { isRecurring: true, isActive: true },
    orderBy: { name: "asc" },
  });
  const existing = await prisma.monthlyExpense.findMany({
    where: { periodMonth: periodMonthDate, isArchived: false },
    select: { categoryId: true },
  });
  const existingCategoryIds = new Set(existing.map((row) => row.categoryId));

  return recurringCategories
    .filter((category) => !existingCategoryIds.has(category.id))
    .map((category) => ({ categoryId: category.id, categoryName: category.name }));
}

export interface VarianceWarning {
  categoryId: string;
  categoryName: string;
  currentAmount: string;
  previousAmount: string;
  thresholdAmount: string;
}

/**
 * FR-WARN-04 (Should), approved formula:
 * `threshold = max(Rs 5,000, abs(previousMonthAmount) × 20%)`; flagged when
 * `abs(current - previous) > threshold`. A missing previous month behaves
 * identically to a zero previous month (both produce threshold = 5,000) —
 * no special-casing, `Decimal` arithmetic throughout.
 */
export async function listVarianceWarnings(
  prisma: PrismaClient,
  periodMonth: string,
): Promise<VarianceWarning[]> {
  const periodMonthDate = parseCalendarDate(`${periodMonth}-01`)!;
  const previousMonthDate = parseCalendarDate(`${previousYearMonth(periodMonth)}-01`)!;

  const [currentRows, previousRows] = await Promise.all([
    prisma.monthlyExpense.groupBy({
      by: ["categoryId"],
      _sum: { amount: true },
      where: { isArchived: false, periodMonth: periodMonthDate },
    }),
    prisma.monthlyExpense.groupBy({
      by: ["categoryId"],
      _sum: { amount: true },
      where: { isArchived: false, periodMonth: previousMonthDate },
    }),
  ]);
  const previousByCategory = new Map(
    previousRows.map((row) => [row.categoryId, row._sum.amount ?? ZERO]),
  );

  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: currentRows.map((row) => row.categoryId) } },
  });
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const warnings: VarianceWarning[] = [];
  for (const row of currentRows) {
    const current: Decimal = row._sum.amount ?? ZERO;
    const previous: Decimal = previousByCategory.get(row.categoryId) ?? ZERO;
    const minimumThreshold = new Decimal(5000);
    const percentThreshold = previous.abs().times(0.2);
    const threshold = percentThreshold.greaterThan(minimumThreshold)
      ? percentThreshold
      : minimumThreshold;
    const delta = current.minus(previous).abs();
    if (delta.greaterThan(threshold)) {
      const category = categoryById.get(row.categoryId);
      warnings.push({
        categoryId: row.categoryId,
        categoryName: category?.name ?? "Unknown",
        currentAmount: current.toString(),
        previousAmount: previous.toString(),
        thresholdAmount: threshold.toString(),
      });
    }
  }
  return warnings.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

export interface DashboardWarnings {
  missingRecurring: MissingRecurringCategory[];
  missingInstalments: { assetId: string; assetName: string }[];
  variance: VarianceWarning[];
}

/** FR-WARN-01/02/04, gathered together for the Dashboard (FR-WARN-03: dashboard-only, never blocking any entry/calculation path — this function is never called from a mutation). */
export async function getDashboardWarnings(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  periodMonth: string,
): Promise<DashboardWarnings> {
  requirePermission(currentUser, "report:dashboard");

  const [missingRecurring, missingInstalmentCandidates, variance] = await Promise.all([
    listMissingRecurringCategories(prisma, periodMonth),
    listInstalmentGenerationCandidates(prisma, periodMonth),
    listVarianceWarnings(prisma, periodMonth),
  ]);

  return {
    missingRecurring,
    missingInstalments: missingInstalmentCandidates.map((c) => ({
      assetId: c.assetId,
      assetName: c.assetName,
    })),
    variance,
  };
}
