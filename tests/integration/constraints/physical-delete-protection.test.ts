import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestExpenseItem, createTestParty, createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

/**
 * BR-15/DR-04/CON-04: physical deletion is rejected at the database level
 * for every business, financial, master-data, settings, user, and audit
 * table — proven here by an actual failing DELETE per table, not inferred
 * from the absence of delete code. `audit_log`'s DELETE rejection is
 * covered by audit-log-append-only.test.ts (the same trigger also
 * rejects UPDATE there); every other table is covered below.
 */
describe("physical-deletion prevention (BR-15, DR-04, CON-04) — BEFORE DELETE triggers", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects DELETE on users", async () => {
    const user = await createTestUser();
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow(/not permitted/);
  });

  it("rejects DELETE on parties", async () => {
    const party = await createTestParty();
    await expect(prisma.party.delete({ where: { id: party.id } })).rejects.toThrow(/not permitted/);
  });

  it("rejects DELETE on expense_items", async () => {
    const item = await createTestExpenseItem();
    await expect(prisma.expenseItem.delete({ where: { id: item.id } })).rejects.toThrow(
      /not permitted/,
    );
  });

  it("rejects DELETE on expense_categories", async () => {
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${crypto.randomUUID()}`, expenseGroup: "ADMIN" },
    });
    await expect(prisma.expenseCategory.delete({ where: { id: category.id } })).rejects.toThrow(
      /not permitted/,
    );
  });

  it("rejects DELETE on vendors", async () => {
    const vendor = await prisma.vendor.create({ data: { name: `Vendor ${crypto.randomUUID()}` } });
    await expect(prisma.vendor.delete({ where: { id: vendor.id } })).rejects.toThrow(
      /not permitted/,
    );
  });

  it("rejects DELETE on daily_expenses", async () => {
    const item = await createTestExpenseItem();
    const user = await createTestUser();
    const expense = await prisma.dailyExpense.create({
      data: {
        clientUuid: crypto.randomUUID(),
        expenseDate: new Date("2026-07-01"),
        expenseItemId: item.id,
        amount: "100",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await expect(prisma.dailyExpense.delete({ where: { id: expense.id } })).rejects.toThrow(
      /not permitted/,
    );
  });

  it("rejects DELETE on monthly_expenses", async () => {
    const user = await createTestUser();
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${crypto.randomUUID()}`, expenseGroup: "ADMIN" },
    });
    const expense = await prisma.monthlyExpense.create({
      data: {
        clientUuid: crypto.randomUUID(),
        periodMonth: new Date("2026-07-01"),
        categoryId: category.id,
        amount: "1000",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await expect(prisma.monthlyExpense.delete({ where: { id: expense.id } })).rejects.toThrow(
      /not permitted/,
    );
  });

  it("rejects DELETE on party_income", async () => {
    const party = await createTestParty();
    const user = await createTestUser();
    const income = await prisma.partyIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        partyId: party.id,
        incomeDate: new Date("2026-07-01"),
        amount: "500",
        receiptType: "DAILY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await expect(prisma.partyIncome.delete({ where: { id: income.id } })).rejects.toThrow(
      /not permitted/,
    );
  });

  it("rejects DELETE on counter_income", async () => {
    const user = await createTestUser();
    const income = await prisma.counterIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        incomeDate: new Date("2026-07-01"),
        amount: "500",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await expect(prisma.counterIncome.delete({ where: { id: income.id } })).rejects.toThrow(
      /not permitted/,
    );
  });

  it("rejects DELETE on assets", async () => {
    const user = await createTestUser();
    const asset = await prisma.asset.create({
      data: {
        name: "Test Asset",
        classification: "FIXED",
        acquisitionMode: "INSTALMENT",
        monthlyInstalment: "1000",
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await expect(prisma.asset.delete({ where: { id: asset.id } })).rejects.toThrow(/not permitted/);
  });

  it("rejects DELETE on capital_contributions", async () => {
    const partner = await createTestUser({ isPartner: true });
    const contribution = await prisma.capitalContribution.create({
      data: {
        partnerUserId: partner.id,
        entryDate: new Date("2026-07-01"),
        amount: "1000",
        contributionType: "INITIAL",
        createdBy: partner.id,
        updatedBy: partner.id,
        updatedAt: new Date(),
      },
    });
    await expect(
      prisma.capitalContribution.delete({ where: { id: contribution.id } }),
    ).rejects.toThrow(/not permitted/);
  });

  it("rejects DELETE on app_settings", async () => {
    await prisma.appSetting.create({
      data: {
        settingKey: `test_setting_${crypto.randomUUID()}`,
        settingValue: { a: 1 },
        updatedAt: new Date(),
      },
    });
    const settingKey = (await prisma.appSetting.findFirst({ orderBy: { settingKey: "desc" } }))!
      .settingKey;
    await expect(prisma.appSetting.delete({ where: { settingKey } })).rejects.toThrow(
      /not permitted/,
    );
  });
});
