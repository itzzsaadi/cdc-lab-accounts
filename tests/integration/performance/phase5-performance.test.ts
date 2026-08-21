import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import {
  createTestUser,
  createTestParty,
  createTestExpenseCategory,
  createTestVendor,
} from "../helpers/fixtures";
import {
  computeMonthlyResultTotals,
  getItemizedExpenseBreakdown,
} from "../../../src/server/queries/results";
import { generateMonthlySummaryPdf } from "../../../src/server/reports/monthly-summary-pdf";
import { generateMonthlySummaryExcel } from "../../../src/server/reports/monthly-summary-excel";

const prisma = getTestPrismaClient();

// This file seeds one large, persistent three-year dataset in `beforeAll`
// and reuses it across every `it` below — never per-test truncation (the
// dataset is the point). `vitest.config.mts` runs every integration file
// serially (`fileParallelism: false`), so nothing else touches this
// database while these tests run; `afterAll` truncates once at the end so
// later files still start from an empty database.
afterAll(async () => {
  await resetDatabase();
});

/** `2023-08-01` through `2026-07-31` inclusive — three full calendar years (NFR-PERF-06). */
const RANGE_START = new Date("2023-08-01");
const RANGE_END = new Date("2026-07-31");
const MONTHS: string[] = [];
for (let year = 2023, month = 8; ; month += 1) {
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  MONTHS.push(ym);
  if (ym === "2026-07") break;
}

function daysInclusive(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

/**
 * NFR-PERF-04 (monthly result calculated within 3s), NFR-PERF-05 (a
 * report export produced within 15s), and NFR-PERF-06 (both hold with
 * three years of accumulated data) — proven against a real synthetic
 * three-year dataset in Postgres, not a small/empty fixture. Seeded once
 * via `createMany` bulk inserts (never one-row-at-a-time) so the seed
 * itself stays fast; ~10,000 rows across daily expenses, monthly
 * expenses, party income (daily + monthly), and counter income —
 * comparable in shape to three years of the real workbook's volume.
 */
describe("Phase 5 performance (NFR-PERF-04/05/06)", () => {
  let actorId: string;

  beforeAll(async () => {
    await resetDatabase();
    const actor = await createTestUser({ role: "ADMIN", isPartner: true });
    actorId = actor.id;

    const days = daysInclusive(RANGE_START, RANGE_END);

    const dailyParties = await Promise.all(
      Array.from({ length: 4 }, () => createTestParty({ billingMode: "DAILY" })),
    );
    const monthlyParties = await Promise.all(
      Array.from({ length: 22 }, () => createTestParty({ billingMode: "MONTHLY" })),
    );
    const adminCategories = await Promise.all(
      Array.from({ length: 15 }, () => createTestExpenseCategory({ expenseGroup: "ADMIN" })),
    );
    const purchasingCategories = await Promise.all(
      Array.from({ length: 10 }, () => createTestExpenseCategory({ expenseGroup: "PURCHASING" })),
    );
    const vendor = await createTestVendor();

    const now = new Date();
    const dailyExpenseRows = days.flatMap((day) =>
      Array.from({ length: 3 }, (_, i) => ({
        clientUuid: randomUUID(),
        expenseDate: day,
        customDescription: `Perf fixture item ${i}`,
        amount: "500",
        fundingSource: "BUSINESS" as const,
        capturedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
        updatedAt: now,
      })),
    );
    const counterIncomeRows = days.map((day) => ({
      clientUuid: randomUUID(),
      incomeDate: day,
      amount: "3000",
      capturedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
      updatedAt: now,
    }));
    const dailyPartyIncomeRows = days.flatMap((day) =>
      dailyParties.map((party) => ({
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate: day,
        amount: "1500",
        receiptType: "DAILY" as const,
        capturedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
        updatedAt: now,
      })),
    );
    const monthlyPartyIncomeRows = MONTHS.flatMap((ym) =>
      monthlyParties.map((party) => ({
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate: new Date(`${ym}-01`),
        amount: "20000",
        receiptType: "MONTHLY" as const,
        capturedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
        updatedAt: now,
      })),
    );
    const monthlyExpenseRows = MONTHS.flatMap((ym) => [
      ...adminCategories.map((category) => ({
        clientUuid: randomUUID(),
        periodMonth: new Date(`${ym}-01`),
        categoryId: category.id,
        amount: "10000",
        fundingSource: "BUSINESS" as const,
        capturedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
        updatedAt: now,
      })),
      ...purchasingCategories.map((category) => ({
        clientUuid: randomUUID(),
        periodMonth: new Date(`${ym}-01`),
        categoryId: category.id,
        vendorId: vendor.id,
        amount: "8000",
        fundingSource: "BUSINESS" as const,
        capturedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
        updatedAt: now,
      })),
    ]);

    await prisma.dailyExpense.createMany({ data: dailyExpenseRows });
    await prisma.counterIncome.createMany({ data: counterIncomeRows });
    await prisma.partyIncome.createMany({
      data: [...dailyPartyIncomeRows, ...monthlyPartyIncomeRows],
    });
    await prisma.monthlyExpense.createMany({ data: monthlyExpenseRows });
  }, 120_000);

  it("computes one month's result within 3 seconds with three years of data present (NFR-PERF-04/06)", async () => {
    const started = performance.now();
    const totals = await computeMonthlyResultTotals(prisma, {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    const elapsedMs = performance.now() - started;

    expect(totals.totalIncome).not.toBe("0");
    expect(elapsedMs).toBeLessThan(3000);
  });

  it("produces a Monthly Summary Excel export across the full three-year range within 15 seconds (NFR-PERF-05/06)", async () => {
    const range = { from: "2023-08-01", to: "2026-07-31" };
    const [totals, breakdown] = await Promise.all([
      computeMonthlyResultTotals(prisma, range),
      getItemizedExpenseBreakdown(
        prisma,
        { id: actorId, role: "ADMIN", isPartner: true, isActive: true },
        range,
      ),
    ]);

    const started = performance.now();
    const buffer = await generateMonthlySummaryExcel(
      prisma,
      range,
      totals,
      breakdown.administration,
      breakdown.purchasing,
      "Performance Test",
      "2026-08-21 00:00",
    );
    const elapsedMs = performance.now() - started;

    expect(buffer.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(15_000);
  }, 20_000);

  it("produces a Monthly Summary PDF export across the full three-year range within 15 seconds (NFR-PERF-05/06)", async () => {
    const range = { from: "2023-08-01", to: "2026-07-31" };
    const [totals, breakdown] = await Promise.all([
      computeMonthlyResultTotals(prisma, range),
      getItemizedExpenseBreakdown(
        prisma,
        { id: actorId, role: "ADMIN", isPartner: true, isActive: true },
        range,
      ),
    ]);

    const started = performance.now();
    const buffer = await generateMonthlySummaryPdf({
      range,
      totals,
      administration: breakdown.administration,
      purchasing: breakdown.purchasing,
      generatedByFullName: "Performance Test",
      generatedAtKarachi: "2026-08-21 00:00",
    });
    const elapsedMs = performance.now() - started;

    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(elapsedMs).toBeLessThan(15_000);
  }, 20_000);
});
