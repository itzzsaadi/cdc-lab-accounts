import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestParty, createTestExpenseCategory } from "../helpers/fixtures";
import {
  computeMonthlyResultTotals,
  getItemizedExpenseBreakdown,
} from "../../../src/server/queries/results";
import { generateMonthlySummaryPdf } from "../../../src/server/reports/monthly-summary-pdf";
import { generateMonthlySummaryExcel } from "../../../src/server/reports/monthly-summary-excel";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("Monthly Summary exports (FR-RPT-06/07/08)", () => {
  it("generates a valid PDF buffer", async () => {
    const user = await partnerUser();
    const range = { from: "2026-07-01", to: "2026-07-31" };
    const totals = await computeMonthlyResultTotals(prisma, range);
    const { administration, purchasing } = await getItemizedExpenseBreakdown(prisma, user, range);

    const buffer = await generateMonthlySummaryPdf({
      range,
      totals,
      administration,
      purchasing,
      generatedByFullName: "Test Partner",
      generatedAtKarachi: "2026-08-21 18:30",
    });

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("generates a valid multi-sheet Excel workbook with the expected sheet names", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const range = { from: "2026-07-01", to: "2026-07-31" };

    // A crafted description beginning with "=" — must round-trip safely.
    await prisma.dailyExpense.create({
      data: {
        clientUuid: randomUUID(),
        expenseDate: new Date("2026-07-05"),
        customDescription: "=cmd|'/c calc'!A1",
        amount: "500",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate: new Date("2026-07-06"),
        amount: "1000",
        receiptType: "DAILY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    const totals = await computeMonthlyResultTotals(prisma, range);
    const { administration, purchasing } = await getItemizedExpenseBreakdown(prisma, user, range);

    const buffer = await generateMonthlySummaryExcel(
      prisma,
      range,
      totals,
      administration,
      purchasing,
      "Test Partner",
      "2026-08-21 18:30",
    );

    expect(buffer.length).toBeGreaterThan(0);
    // ZIP/xlsx signature.
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    expect(sheetNames).toEqual([
      "Summary",
      "Daily Expenses",
      "Monthly Expenses",
      "Party Income",
      "Counter Income",
    ]);

    const dailySheet = workbook.getWorksheet("Daily Expenses")!;
    const descriptionCell = dailySheet.getRow(2).getCell(2).value as string;
    expect(descriptionCell.startsWith("'")).toBe(true);
    expect(descriptionCell).toContain("=cmd");

    // Monetary cell is a real number, not a formatted string.
    const amountCell = dailySheet.getRow(2).getCell(3).value;
    expect(typeof amountCell).toBe("number");
    expect(amountCell).toBe(500);
  });

  it("never includes an Audit Log sheet", async () => {
    const user = await partnerUser();
    const range = { from: "2026-07-01", to: "2026-07-31" };
    const totals = await computeMonthlyResultTotals(prisma, range);
    const { administration, purchasing } = await getItemizedExpenseBreakdown(prisma, user, range);
    const buffer = await generateMonthlySummaryExcel(
      prisma,
      range,
      totals,
      administration,
      purchasing,
      "Test Partner",
      "2026-08-21 18:30",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((s) => s.name)).not.toContain("Audit Log");
  });
});
