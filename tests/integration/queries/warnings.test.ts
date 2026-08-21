import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import {
  listMissingRecurringCategories,
  listVarianceWarnings,
} from "../../../src/server/queries/warnings";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

describe("listMissingRecurringCategories (FR-WARN-01)", () => {
  it("flags a recurring active category with no row this month, including one with no history at all", async () => {
    const user = await createTestUser({ isPartner: true });
    const recurring = await prisma.expenseCategory.create({
      data: { name: `Recurring ${randomUUID()}`, expenseGroup: "ADMIN", isRecurring: true },
    });
    const nonRecurring = await prisma.expenseCategory.create({
      data: { name: `NonRecurring ${randomUUID()}`, expenseGroup: "ADMIN", isRecurring: false },
    });

    const missing = await listMissingRecurringCategories(prisma, "2026-08");
    const ids = missing.map((m) => m.categoryId);
    expect(ids).toContain(recurring.id);
    expect(ids).not.toContain(nonRecurring.id);

    await prisma.monthlyExpense.create({
      data: {
        clientUuid: randomUUID(),
        periodMonth: new Date("2026-08-01"),
        categoryId: recurring.id,
        amount: "1000",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    const afterEntry = await listMissingRecurringCategories(prisma, "2026-08");
    expect(afterEntry.map((m) => m.categoryId)).not.toContain(recurring.id);
  });
});

describe("listVarianceWarnings (FR-WARN-04, approved formula)", () => {
  async function entry(userId: string, categoryId: string, periodMonth: string, amount: string) {
    await prisma.monthlyExpense.create({
      data: {
        clientUuid: randomUUID(),
        periodMonth: new Date(`${periodMonth}-01`),
        categoryId,
        amount,
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: userId,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });
  }

  it("flags when delta exceeds max(5000, previous*20%)", async () => {
    const user = await createTestUser({ isPartner: true });
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${randomUUID()}`, expenseGroup: "ADMIN" },
    });
    await entry(user.id, category.id, "2026-07", "62000");
    await entry(user.id, category.id, "2026-08", "75000"); // delta 13000 > max(5000, 12400)

    const warnings = await listVarianceWarnings(prisma, "2026-08");
    const found = warnings.find((w) => w.categoryId === category.id);
    expect(found).toBeDefined();
    expect(found!.thresholdAmount).toBe("12400");
  });

  it("does not flag when delta is within the threshold", async () => {
    const user = await createTestUser({ isPartner: true });
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${randomUUID()}`, expenseGroup: "ADMIN" },
    });
    await entry(user.id, category.id, "2026-07", "62000");
    await entry(user.id, category.id, "2026-08", "65000"); // delta 3000 < 12400

    const warnings = await listVarianceWarnings(prisma, "2026-08");
    expect(warnings.find((w) => w.categoryId === category.id)).toBeUndefined();
  });

  it("uses the Rs 5,000 floor when the previous month is missing", async () => {
    const user = await createTestUser({ isPartner: true });
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${randomUUID()}`, expenseGroup: "ADMIN" },
    });
    await entry(user.id, category.id, "2026-08", "6000"); // no July row at all

    const warnings = await listVarianceWarnings(prisma, "2026-08");
    const found = warnings.find((w) => w.categoryId === category.id);
    expect(found).toBeDefined();
    expect(found!.thresholdAmount).toBe("5000");
  });
});
