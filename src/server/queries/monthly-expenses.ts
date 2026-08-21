import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { monthBounds, parseCalendarDate, parseYearMonth } from "../../lib/domain/calendar-date";
import { Decimal, ZERO } from "../../lib/domain/money";
import { isProfitAffecting } from "../../lib/domain/funding-source";

/**
 * FR-MEXP-01/03/04. Administration and Purchasing are totalled separately
 * for display (each subtotal includes every listed row regardless of
 * funding source, matching the existing workbook's own layout) and combined
 * into one Business-funded total for profit calc (FR-RES-05 reuses this
 * same figure later, via `isProfitAffecting`). FR-MEXP-03: the current
 * month's `daily_expenses` total is a read-only display line inside
 * Purchasing — never written as a `monthly_expenses` row, so it can never
 * double-count against `totalExpenses`'s own separate daily/monthly sums.
 */
export async function listMonthlyExpenses(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  periodMonth: string,
) {
  requirePermission(currentUser, "monthly-expense:manage");

  const parsed = parseYearMonth(periodMonth);
  if (!parsed) {
    throw new Error("Invalid period month.");
  }
  const periodMonthDate = parseCalendarDate(`${periodMonth}-01`)!;

  const rows = await prisma.monthlyExpense.findMany({
    where: { isArchived: false, periodMonth: periodMonthDate },
    include: {
      category: { select: { id: true, name: true, expenseGroup: true, isActive: true } },
      vendor: { select: { id: true, name: true } },
      fundedBy: { select: { id: true, fullName: true } },
      asset: { select: { id: true, name: true } },
    },
    orderBy: [{ category: { name: "asc" } }, { id: "asc" }],
  });

  const administration = rows.filter((row) => row.category.expenseGroup === "ADMIN");
  const purchasing = rows.filter((row) => row.category.expenseGroup === "PURCHASING");

  const { firstDay, lastDay } = monthBounds(periodMonth);
  const dailyExpenses = await prisma.dailyExpense.findMany({
    where: {
      isArchived: false,
      expenseDate: { gte: parseCalendarDate(firstDay)!, lte: parseCalendarDate(lastDay)! },
    },
    select: { amount: true, fundingSource: true },
  });
  const dailyExpenseTotal = dailyExpenses.reduce<Decimal>((sum, row) => sum.plus(row.amount), ZERO);
  const dailyExpenseBusinessTotal = dailyExpenses
    .filter(isProfitAffecting)
    .reduce<Decimal>((sum, row) => sum.plus(row.amount), ZERO);

  const sum = (items: typeof rows) =>
    items.reduce<Decimal>((total, row) => total.plus(row.amount), ZERO);
  const businessSum = (items: typeof rows) =>
    items.filter(isProfitAffecting).reduce<Decimal>((total, row) => total.plus(row.amount), ZERO);

  const administrationSubtotal = sum(administration);
  const purchasingItemsSubtotal = sum(purchasing);
  const purchasingSubtotal = purchasingItemsSubtotal.plus(dailyExpenseTotal);
  const combinedBusinessTotal = businessSum(administration)
    .plus(businessSum(purchasing))
    .plus(dailyExpenseBusinessTotal);

  return {
    periodMonth,
    administration: { items: administration, subtotal: administrationSubtotal.toString() },
    purchasing: {
      items: purchasing,
      dailyExpenseTotal: dailyExpenseTotal.toString(),
      subtotal: purchasingSubtotal.toString(),
    },
    combinedBusinessTotal: combinedBusinessTotal.toString(),
  };
}

/** Active Administration + Purchasing categories for the create/edit form pickers — an archived category never appears here, only on an already-existing row's own display (via `listMonthlyExpenses`'s include above). */
export async function listActiveExpenseCategories(prisma: PrismaClient) {
  return prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function listActiveVendors(prisma: PrismaClient) {
  return prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

/** FR-MEXP-06's candidate list: recurring categories with no live row yet for `periodMonth`, pre-filled from their own most recent prior row (any earlier month, not necessarily last month, so a category skipped for two months still pre-fills sensibly). */
export async function listRecurringPrefillCandidates(prisma: PrismaClient, periodMonth: string) {
  const parsed = parseYearMonth(periodMonth);
  if (!parsed) {
    throw new Error("Invalid period month.");
  }
  const periodMonthDate = parseCalendarDate(`${periodMonth}-01`)!;

  const recurringCategories = await prisma.expenseCategory.findMany({
    where: { isRecurring: true, isActive: true },
  });

  const existing = await prisma.monthlyExpense.findMany({
    where: { periodMonth: periodMonthDate, isArchived: false },
    select: { categoryId: true },
  });
  const existingCategoryIds = new Set(existing.map((row) => row.categoryId));

  const candidates = [];
  for (const category of recurringCategories) {
    if (existingCategoryIds.has(category.id)) continue;
    const previous = await prisma.monthlyExpense.findFirst({
      where: { categoryId: category.id, isArchived: false, periodMonth: { lt: periodMonthDate } },
      orderBy: { periodMonth: "desc" },
    });
    if (!previous) continue; // nothing to pre-fill from — Partner adds it manually the first time
    candidates.push({
      categoryId: category.id,
      categoryName: category.name,
      vendorId: previous.vendorId,
      description: previous.description,
      amount: previous.amount.toString(),
      fundingSource: previous.fundingSource,
      fundedByUserId: previous.fundedByUserId,
    });
  }
  return candidates;
}

/** FR-AST-04's candidate list: every ACTIVE instalment asset with no live `monthly_expenses` row yet for `periodMonth` (the partial unique index is the DB-level authority; this is the preview read). */
export async function listInstalmentGenerationCandidates(
  prisma: PrismaClient,
  periodMonth: string,
) {
  const parsed = parseYearMonth(periodMonth);
  if (!parsed) {
    throw new Error("Invalid period month.");
  }
  const periodMonthDate = parseCalendarDate(`${periodMonth}-01`)!;

  const activeInstalmentAssets = await prisma.asset.findMany({
    where: { status: "ACTIVE", acquisitionMode: "INSTALMENT" },
    include: { defaultCategory: { select: { id: true, name: true, isActive: true } } },
  });

  const existing = await prisma.monthlyExpense.findMany({
    where: { periodMonth: periodMonthDate, isArchived: false, assetId: { not: null } },
    select: { assetId: true },
  });
  const alreadyGenerated = new Set(existing.map((row) => row.assetId));

  return activeInstalmentAssets
    .filter((asset) => !alreadyGenerated.has(asset.id))
    .map((asset) => ({
      assetId: asset.id,
      assetName: asset.name,
      amount: asset.monthlyInstalment!.toString(),
      categoryId: asset.defaultCategoryId!,
      categoryName: asset.defaultCategory?.name ?? "Unknown",
    }));
}
