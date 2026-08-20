import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestExpenseItem, createTestParty, createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

describe("monetary positivity constraints (DR-01, SRS §6)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a zero daily_expenses.amount (requires > 0)", async () => {
    const item = await createTestExpenseItem();
    const user = await createTestUser();
    await expect(
      prisma.dailyExpense.create({
        data: {
          clientUuid: crypto.randomUUID(),
          expenseDate: new Date("2026-07-01"),
          expenseItemId: item.id,
          amount: "0",
          fundingSource: "BUSINESS",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a negative party_income.amount (requires > 0)", async () => {
    const party = await createTestParty();
    const user = await createTestUser();
    await expect(
      prisma.partyIncome.create({
        data: {
          clientUuid: crypto.randomUUID(),
          partyId: party.id,
          incomeDate: new Date("2026-07-01"),
          amount: "-1",
          receiptType: "DAILY",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("allows a zero counter_income.amount (requires >= 0, unlike other tables)", async () => {
    const user = await createTestUser();
    const created = await prisma.counterIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        incomeDate: new Date("2026-07-01"),
        amount: "0",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    expect(created.amount.toString()).toBe("0");
  });

  it("rejects a negative counter_income.amount", async () => {
    const user = await createTestUser();
    await expect(
      prisma.counterIncome.create({
        data: {
          clientUuid: crypto.randomUUID(),
          incomeDate: new Date("2026-07-01"),
          amount: "-0.01",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a zero capital_contributions.amount (requires > 0)", async () => {
    const partner = await createTestUser({ isPartner: true });
    await expect(
      prisma.capitalContribution.create({
        data: {
          partnerUserId: partner.id,
          entryDate: new Date("2026-07-01"),
          amount: "0",
          contributionType: "INITIAL",
          createdBy: partner.id,
          updatedBy: partner.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a zero or negative assets.monthly_instalment when set", async () => {
    const user = await createTestUser();
    await expect(
      prisma.asset.create({
        data: {
          name: "Zero Instalment",
          classification: "FIXED",
          acquisitionMode: "INSTALMENT",
          monthlyInstalment: "0",
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a zero or negative assets.purchase_price when set", async () => {
    const partner = await createTestUser({ isPartner: true });
    await expect(
      prisma.asset.create({
        data: {
          name: "Zero Purchase Price",
          classification: "FIXED",
          acquisitionMode: "CASH",
          purchasePrice: "-5",
          purchasedByUserId: partner.id,
          createdBy: partner.id,
          updatedBy: partner.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});
