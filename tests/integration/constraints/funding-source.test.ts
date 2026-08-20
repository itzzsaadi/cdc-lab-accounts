import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestExpenseItem, createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

describe("funding-source bidirectional exclusivity (DR-07, approved decision)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects PARTNER funding source with no partner named", async () => {
    const item = await createTestExpenseItem();
    const user = await createTestUser();
    await expect(
      prisma.dailyExpense.create({
        data: {
          clientUuid: crypto.randomUUID(),
          expenseDate: new Date("2026-07-01"),
          expenseItemId: item.id,
          amount: "100.00",
          fundingSource: "PARTNER",
          fundedByUserId: null,
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects BUSINESS funding source with a partner named (bidirectional exclusivity)", async () => {
    const item = await createTestExpenseItem();
    const user = await createTestUser();
    const partner = await createTestUser({ isPartner: true });
    await expect(
      prisma.dailyExpense.create({
        data: {
          clientUuid: crypto.randomUUID(),
          expenseDate: new Date("2026-07-01"),
          expenseItemId: item.id,
          amount: "100.00",
          fundingSource: "BUSINESS",
          fundedByUserId: partner.id,
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("allows PARTNER funding source with a real partner named", async () => {
    const item = await createTestExpenseItem();
    const user = await createTestUser();
    const partner = await createTestUser({ isPartner: true });
    const created = await prisma.dailyExpense.create({
      data: {
        clientUuid: crypto.randomUUID(),
        expenseDate: new Date("2026-07-01"),
        expenseItemId: item.id,
        amount: "100.00",
        fundingSource: "PARTNER",
        fundedByUserId: partner.id,
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    expect(created.fundedByUserId).toBe(partner.id);
  });

  it("allows BUSINESS funding source with no partner named", async () => {
    const item = await createTestExpenseItem();
    const user = await createTestUser();
    const created = await prisma.dailyExpense.create({
      data: {
        clientUuid: crypto.randomUUID(),
        expenseDate: new Date("2026-07-01"),
        expenseItemId: item.id,
        amount: "100.00",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    expect(created.fundedByUserId).toBeNull();
  });
});
