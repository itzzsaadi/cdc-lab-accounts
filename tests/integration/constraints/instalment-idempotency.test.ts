import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

async function createInstalmentAsset(userId: string) {
  return prisma.asset.create({
    data: {
      name: "Haematology Analyser",
      classification: "FIXED",
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
      createdBy: userId,
      updatedBy: userId,
      updatedAt: new Date(),
    },
  });
}

describe("instalment idempotency (Phase 1 plan §10) — partial unique index", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a second active instalment row for the same asset and month", async () => {
    const user = await createTestUser();
    const asset = await createInstalmentAsset(user.id);
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${crypto.randomUUID()}`, expenseGroup: "PURCHASING" },
    });
    const periodMonth = new Date("2026-07-01");

    await prisma.monthlyExpense.create({
      data: {
        clientUuid: crypto.randomUUID(),
        periodMonth,
        categoryId: category.id,
        assetId: asset.id,
        amount: "50000",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    await expect(
      prisma.monthlyExpense.create({
        data: {
          clientUuid: crypto.randomUUID(),
          periodMonth,
          categoryId: category.id,
          assetId: asset.id,
          amount: "50000",
          fundingSource: "BUSINESS",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("allows archive-then-correct: archiving the wrong row permits a corrected replacement for the same asset+month", async () => {
    const user = await createTestUser();
    const asset = await createInstalmentAsset(user.id);
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${crypto.randomUUID()}`, expenseGroup: "PURCHASING" },
    });
    const periodMonth = new Date("2026-07-01");

    const wrong = await prisma.monthlyExpense.create({
      data: {
        clientUuid: crypto.randomUUID(),
        periodMonth,
        categoryId: category.id,
        assetId: asset.id,
        amount: "45000",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    await prisma.monthlyExpense.update({
      where: { id: wrong.id },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });

    const corrected = await prisma.monthlyExpense.create({
      data: {
        clientUuid: crypto.randomUUID(),
        periodMonth,
        categoryId: category.id,
        assetId: asset.id,
        amount: "50000",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    expect(corrected.amount.toString()).toBe("50000");

    const historicalRowCount = await prisma.monthlyExpense.count({
      where: { assetId: asset.id, periodMonth },
    });
    expect(historicalRowCount).toBe(2); // archived original + corrected row, both preserved
  });
});
