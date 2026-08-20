import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestExpenseItem, createTestParty, createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

/**
 * DR-05/CLAUDE.md §14 — exactly four tables carry client_uuid, and it must
 * be unique, so a retried offline upload can never create a duplicate.
 */
describe("client_uuid uniqueness (DR-05) — the four offline-capable tables", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a duplicate client_uuid on daily_expenses", async () => {
    const item = await createTestExpenseItem();
    const user = await createTestUser();
    const clientUuid = crypto.randomUUID();
    const data = {
      clientUuid,
      expenseDate: new Date("2026-07-01"),
      expenseItemId: item.id,
      amount: "100",
      fundingSource: "BUSINESS" as const,
      capturedAt: new Date(),
      createdBy: user.id,
      updatedBy: user.id,
      updatedAt: new Date(),
    };
    await prisma.dailyExpense.create({ data });
    await expect(prisma.dailyExpense.create({ data: { ...data } })).rejects.toThrow();
  });

  it("rejects a duplicate client_uuid on monthly_expenses", async () => {
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${crypto.randomUUID()}`, expenseGroup: "ADMIN" },
    });
    const user = await createTestUser();
    const clientUuid = crypto.randomUUID();
    const data = {
      clientUuid,
      periodMonth: new Date("2026-07-01"),
      categoryId: category.id,
      amount: "1000",
      fundingSource: "BUSINESS" as const,
      capturedAt: new Date(),
      createdBy: user.id,
      updatedBy: user.id,
      updatedAt: new Date(),
    };
    await prisma.monthlyExpense.create({ data });
    await expect(prisma.monthlyExpense.create({ data: { ...data } })).rejects.toThrow();
  });

  it("rejects a duplicate client_uuid on party_income", async () => {
    const party = await createTestParty();
    const user = await createTestUser();
    const clientUuid = crypto.randomUUID();
    const data = {
      clientUuid,
      partyId: party.id,
      incomeDate: new Date("2026-07-01"),
      amount: "500",
      receiptType: "DAILY" as const,
      capturedAt: new Date(),
      createdBy: user.id,
      updatedBy: user.id,
      updatedAt: new Date(),
    };
    await prisma.partyIncome.create({ data });
    await expect(prisma.partyIncome.create({ data: { ...data } })).rejects.toThrow();
  });

  it("rejects a duplicate client_uuid on counter_income", async () => {
    const user = await createTestUser();
    const clientUuid = crypto.randomUUID();
    const data = {
      clientUuid,
      incomeDate: new Date("2026-07-01"),
      amount: "500",
      capturedAt: new Date(),
      createdBy: user.id,
      updatedBy: user.id,
      updatedAt: new Date(),
    };
    await prisma.counterIncome.create({ data });
    await expect(prisma.counterIncome.create({ data: { ...data } })).rejects.toThrow();
  });
});
