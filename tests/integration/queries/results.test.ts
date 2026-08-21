import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestParty, createTestExpenseCategory } from "../helpers/fixtures";
import {
  computeMonthlyResultTotals,
  getDashboardTrend,
  getItemizedExpenseBreakdown,
} from "../../../src/server/queries/results";
import { configurePartnerMapping } from "../../../src/server/mutations/app-settings";
import { PermissionDeniedError } from "../../../src/lib/permissions/guard";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

describe("computeMonthlyResultTotals (FR-RES-04 to 08)", () => {
  it("sums counter income, party income (daily+cash+monthly), and business-only expenses into the exact net result and split", async () => {
    const user = await createTestUser({ role: "PARTNER", isPartner: true });
    const partnerA = await createTestUser({ isPartner: true });
    const partnerB = await createTestUser({ isPartner: true });
    await configurePartnerMapping(
      prisma,
      { ...user, role: "ADMIN" },
      {
        partnerAUserId: partnerA.id,
        partnerBUserId: partnerB.id,
      },
    );

    const party = await createTestParty({ billingMode: "DAILY" });
    const category = await createTestExpenseCategory({ expenseGroup: "ADMIN" });

    await prisma.counterIncome.create({
      data: {
        clientUuid: randomUUID(),
        incomeDate: new Date("2026-07-10"),
        amount: "1000",
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
        incomeDate: new Date("2026-07-10"),
        amount: "2000",
        receiptType: "DAILY",
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
        incomeDate: new Date("2026-07-01"),
        amount: "3000",
        receiptType: "MONTHLY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.dailyExpense.create({
      data: {
        clientUuid: randomUUID(),
        expenseDate: new Date("2026-07-15"),
        customDescription: "Water",
        amount: "500",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    // Partner-funded — must be excluded from totalExpenses entirely (BR-05/06).
    await prisma.dailyExpense.create({
      data: {
        clientUuid: randomUUID(),
        expenseDate: new Date("2026-07-16"),
        customDescription: "Personal tool",
        amount: "8000",
        fundingSource: "PARTNER",
        fundedByUserId: partnerA.id,
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.monthlyExpense.create({
      data: {
        clientUuid: randomUUID(),
        periodMonth: new Date("2026-07-01"),
        categoryId: category.id,
        amount: "1500",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    const result = await computeMonthlyResultTotals(prisma, {
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(result.totalCounterIncome).toBe("1000");
    expect(result.totalPartyIncome).toBe("5000"); // 2000 daily + 3000 monthly
    expect(result.totalIncome).toBe("6000");
    expect(result.totalExpenses).toBe("2000"); // 500 daily-business + 1500 monthly-business (8000 partner excluded)
    expect(result.netResult).toBe("4000");
    expect(result.split.isConfigured).toBe(true);
    expect(result.split.shareA).toBe("2000");
    expect(result.split.shareB).toBe("2000");
  });

  it("reports isConfigured=false and null shares when no partner mapping exists", async () => {
    const result = await computeMonthlyResultTotals(prisma, {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(result.split.isConfigured).toBe(false);
    expect(result.split.shareA).toBeNull();
  });

  it("a whole-month-anchored monthly expense outside a partial custom range's month bounds is excluded", async () => {
    const user = await createTestUser({ isPartner: true });
    const category = await createTestExpenseCategory({ expenseGroup: "ADMIN" });
    await prisma.monthlyExpense.create({
      data: {
        clientUuid: randomUUID(),
        periodMonth: new Date("2026-06-01"),
        categoryId: category.id,
        amount: "9999",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    const result = await computeMonthlyResultTotals(prisma, {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(result.totalExpenses).toBe("0");
  });
});

describe("getDashboardTrend (FR-DASH)", () => {
  it("returns one point per requested month, in chronological order, ending at the given month", async () => {
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });

    await prisma.counterIncome.create({
      data: {
        clientUuid: randomUUID(),
        incomeDate: new Date("2026-06-05"),
        amount: "700",
        capturedAt: new Date(),
        createdBy: partner.id,
        updatedBy: partner.id,
        updatedAt: new Date(),
      },
    });
    await prisma.counterIncome.create({
      data: {
        clientUuid: randomUUID(),
        incomeDate: new Date("2026-07-05"),
        amount: "1200",
        capturedAt: new Date(),
        createdBy: partner.id,
        updatedBy: partner.id,
        updatedAt: new Date(),
      },
    });

    const trend = await getDashboardTrend(prisma, partner, "2026-07", 3);

    expect(trend.map((p) => p.month)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(trend[1].totalIncome).toBe("700");
    expect(trend[2].totalIncome).toBe("1200");
  });

  it("denies an OPERATOR (report:dashboard is Partner-minimum, FR-AUTH-04)", async () => {
    const operator = await createTestUser({ role: "OPERATOR", isPartner: false });
    await expect(getDashboardTrend(prisma, operator, "2026-07", 3)).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});

describe("getItemizedExpenseBreakdown (BR-07/FR-RES-06 — partner-funded lines stay visible)", () => {
  it("shows a partner-funded category as its own tagged line, alongside a business-funded line for the same category", async () => {
    const user = await createTestUser({ role: "PARTNER", isPartner: true });
    const partner = await createTestUser({ isPartner: true });
    const category = await createTestExpenseCategory({ expenseGroup: "ADMIN" });

    await prisma.monthlyExpense.create({
      data: {
        clientUuid: randomUUID(),
        periodMonth: new Date("2026-07-01"),
        categoryId: category.id,
        amount: "5000",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.monthlyExpense.create({
      data: {
        clientUuid: randomUUID(),
        periodMonth: new Date("2026-07-01"),
        categoryId: category.id,
        amount: "9000",
        fundingSource: "PARTNER",
        fundedByUserId: partner.id,
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    const { administration } = await getItemizedExpenseBreakdown(prisma, user, {
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(administration).toHaveLength(2);
    const businessLine = administration.find((l) => l.fundingSource === "BUSINESS")!;
    const partnerLine = administration.find((l) => l.fundingSource === "PARTNER")!;
    expect(businessLine.amount).toBe("5000");
    expect(partnerLine.amount).toBe("9000");

    // The partner-funded line must never be folded into the business total this breakdown reconciles against.
    const totals = await computeMonthlyResultTotals(prisma, {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(totals.totalExpenses).toBe("5000");
  });
});
