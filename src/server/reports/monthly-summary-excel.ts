import ExcelJS from "exceljs";
import type { PrismaClient } from "../../../generated/prisma/client";
import { Decimal } from "../../lib/domain/money";
import { toSafeExcelNumber } from "../../lib/domain/decimal-export";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import { sanitizeTextCell } from "./export-safety";
import type { MonthlyResultTotals, ItemizedCategoryLine } from "../queries/results";

function monthTruncate(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

/**
 * FR-RPT-07: one sheet per data type — Summary, Daily Expenses, Monthly
 * Expenses, Party Income, Counter Income. Never an Audit Log sheet (FR-RPT
 * only names entries and the monthly summary as exportable). Every
 * monetary cell goes through `toSafeExcelNumber` (throws
 * `UnsafeDecimalExportError` rather than writing a silently-wrong figure —
 * the caller must let that propagate as a failed export, never a
 * corrupted file); every free-text cell goes through `sanitizeTextCell`
 * first (formula-injection protection). Built entirely in memory via
 * `workbook.xlsx.writeBuffer()` — never a temp file.
 */
export async function generateMonthlySummaryExcel(
  prisma: PrismaClient,
  range: { from: string; to: string },
  totals: MonthlyResultTotals,
  administration: ItemizedCategoryLine[],
  purchasing: ItemizedCategoryLine[],
  generatedByFullName: string,
  generatedAtKarachi: string,
): Promise<Buffer> {
  const fromDate = parseCalendarDate(range.from)!;
  const toDate = parseCalendarDate(range.to)!;
  const monthFromDate = parseCalendarDate(monthTruncate(range.from))!;
  const monthToDate = parseCalendarDate(monthTruncate(range.to))!;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = generatedByFullName;
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.addRow(["CDC Lab Accounts System — Monthly Summary"]);
  summary.addRow([`Range: ${range.from} to ${range.to}`]);
  summary.addRow([
    `Generated ${generatedAtKarachi} (Asia/Karachi) by ${sanitizeTextCell(generatedByFullName)}`,
  ]);
  summary.addRow([]);
  summary.addRow(["Figure", "Amount (PKR)"]);
  const addSummaryLine = (label: string, amount: string) =>
    summary.addRow([sanitizeTextCell(label), toSafeExcelNumber(new Decimal(amount))]);
  addSummaryLine("Total Counter Income", totals.totalCounterIncome);
  addSummaryLine("Total Party Income", totals.totalPartyIncome);
  addSummaryLine("Total Income", totals.totalIncome);
  addSummaryLine("Daily Expenses (Business-funded)", totals.dailyExpenseBusinessTotal);
  const dailyExpensePartnerTotal = new Decimal(totals.dailyExpenseTotal).minus(
    totals.dailyExpenseBusinessTotal,
  );
  if (dailyExpensePartnerTotal.greaterThan(0)) {
    addSummaryLine(
      "Daily Expenses (Partner-funded — excluded from profit)",
      dailyExpensePartnerTotal.toString(),
    );
  }
  addSummaryLine("Monthly Expenses (Business-funded)", totals.monthlyExpenseBusinessTotal);
  addSummaryLine("Total Expenses (Business-funded)", totals.totalExpenses);
  addSummaryLine("Net Profit / Loss", totals.netResult);
  const categoryLabel = (item: { categoryName: string; fundingSource: "BUSINESS" | "PARTNER" }) =>
    item.fundingSource === "PARTNER"
      ? `${item.categoryName} (Partner-funded — excluded from profit)`
      : item.categoryName;
  for (const item of administration) {
    addSummaryLine(`Administration — ${categoryLabel(item)}`, item.amount);
  }
  for (const item of purchasing) {
    addSummaryLine(`Purchasing — ${categoryLabel(item)}`, item.amount);
  }
  if (totals.split.isConfigured) {
    addSummaryLine(
      `${totals.split.partnerAName} share (${totals.split.splitAPercent}%)`,
      totals.split.shareA!,
    );
    addSummaryLine(
      `${totals.split.partnerBName} share (${totals.split.splitBPercent}%)`,
      totals.split.shareB!,
    );
  } else {
    summary.addRow(["Partner split", "Not configured"]);
  }

  const dailyExpenses = workbook.addWorksheet("Daily Expenses");
  dailyExpenses.addRow(["Date", "Item / Description", "Amount (PKR)", "Funding Source", "Partner"]);
  const dailyExpenseRows = await prisma.dailyExpense.findMany({
    where: { isArchived: false, expenseDate: { gte: fromDate, lte: toDate } },
    include: { expenseItem: true, fundedBy: { select: { fullName: true } } },
    orderBy: { expenseDate: "asc" },
  });
  for (const row of dailyExpenseRows) {
    dailyExpenses.addRow([
      row.expenseDate.toISOString().slice(0, 10),
      sanitizeTextCell(row.expenseItem?.name ?? row.customDescription ?? ""),
      toSafeExcelNumber(row.amount),
      row.fundingSource,
      row.fundedBy ? sanitizeTextCell(row.fundedBy.fullName) : "",
    ]);
  }

  const monthlyExpenses = workbook.addWorksheet("Monthly Expenses");
  monthlyExpenses.addRow([
    "Period Month",
    "Category",
    "Vendor",
    "Amount (PKR)",
    "Funding Source",
    "Partner",
  ]);
  const monthlyExpenseRows = await prisma.monthlyExpense.findMany({
    where: { isArchived: false, periodMonth: { gte: monthFromDate, lte: monthToDate } },
    include: { category: true, vendor: true, fundedBy: { select: { fullName: true } } },
    orderBy: { periodMonth: "asc" },
  });
  for (const row of monthlyExpenseRows) {
    monthlyExpenses.addRow([
      row.periodMonth.toISOString().slice(0, 7),
      sanitizeTextCell(row.category.name),
      row.vendor ? sanitizeTextCell(row.vendor.name) : "",
      toSafeExcelNumber(row.amount),
      row.fundingSource,
      row.fundedBy ? sanitizeTextCell(row.fundedBy.fullName) : "",
    ]);
  }

  const partyIncome = workbook.addWorksheet("Party Income");
  partyIncome.addRow(["Date", "Party", "Type", "Amount (PKR)", "Note"]);
  const partyIncomeRows = await prisma.partyIncome.findMany({
    where: {
      isArchived: false,
      OR: [
        {
          receiptType: { in: ["DAILY", "CASH_DIRECT"] },
          incomeDate: { gte: fromDate, lte: toDate },
        },
        { receiptType: "MONTHLY", incomeDate: { gte: monthFromDate, lte: monthToDate } },
      ],
    },
    include: { party: true },
    orderBy: { incomeDate: "asc" },
  });
  for (const row of partyIncomeRows) {
    partyIncome.addRow([
      row.incomeDate.toISOString().slice(0, 10),
      sanitizeTextCell(row.party.name),
      row.receiptType,
      toSafeExcelNumber(row.amount),
      row.note ? sanitizeTextCell(row.note) : "",
    ]);
  }

  const counterIncome = workbook.addWorksheet("Counter Income");
  counterIncome.addRow(["Date", "Amount (PKR)", "Note"]);
  const counterIncomeRows = await prisma.counterIncome.findMany({
    where: { isArchived: false, incomeDate: { gte: fromDate, lte: toDate } },
    orderBy: { incomeDate: "asc" },
  });
  for (const row of counterIncomeRows) {
    counterIncome.addRow([
      row.incomeDate.toISOString().slice(0, 10),
      toSafeExcelNumber(row.amount),
      row.note ? sanitizeTextCell(row.note) : "",
    ]);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
