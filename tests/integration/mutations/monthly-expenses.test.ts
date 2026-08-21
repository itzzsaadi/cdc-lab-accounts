import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import {
  createTestUser,
  createTestExpenseCategory,
  createTestInstalmentAsset,
} from "../helpers/fixtures";
import {
  createMonthlyExpense,
  updateMonthlyExpense,
  archiveMonthlyExpense,
  generateInstalmentLines,
  applyRecurringPrefill,
} from "../../../src/server/mutations/monthly-expenses";
import { listRecurringPrefillCandidates } from "../../../src/server/queries/monthly-expenses";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("createMonthlyExpense (FR-MEXP-01/05/08)", () => {
  it("creates a row and one audit row on first submission", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "ADMIN" });
    const clientUuid = randomUUID();

    const result = await createMonthlyExpense(prisma, user, {
      clientUuid,
      periodMonth: "2026-08",
      categoryId: category.id,
      amount: "62000",
      fundingSource: "BUSINESS",
    });

    expect(result).toEqual({ ok: true, id: expect.any(String), replayed: false });
    const rows = await prisma.monthlyExpense.findMany({ where: { clientUuid } });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "monthly_expense", entityId: rows[0].id },
    });
    expect(auditCount).toBe(1);
  });

  it("warns (non-blocking) on a second row for the same category and month, then allows it once confirmed", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });

    await createMonthlyExpense(prisma, user, {
      clientUuid: randomUUID(),
      periodMonth: "2026-08",
      categoryId: category.id,
      amount: "20000",
      fundingSource: "BUSINESS",
    });

    const warned = await createMonthlyExpense(prisma, user, {
      clientUuid: randomUUID(),
      periodMonth: "2026-08",
      categoryId: category.id,
      amount: "5000",
      fundingSource: "BUSINESS",
    });
    expect(warned).toEqual({ ok: false, requiresConfirmation: true });

    const confirmed = await createMonthlyExpense(prisma, user, {
      clientUuid: randomUUID(),
      periodMonth: "2026-08",
      categoryId: category.id,
      amount: "5000",
      fundingSource: "BUSINESS",
      confirmedDuplicate: true,
    });
    expect(confirmed.ok).toBe(true);

    const rows = await prisma.monthlyExpense.count({ where: { categoryId: category.id } });
    expect(rows).toBe(2);
  });
});

describe("updateMonthlyExpense / archiveMonthlyExpense (atomic conditional write)", () => {
  it("rejects a stale update", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "ADMIN" });
    const created = await createMonthlyExpense(prisma, user, {
      clientUuid: randomUUID(),
      periodMonth: "2026-08",
      categoryId: category.id,
      amount: "1000",
      fundingSource: "BUSINESS",
    });
    if (!created.ok) throw new Error("setup failed");
    const row = await prisma.monthlyExpense.findUniqueOrThrow({ where: { id: created.id } });

    const result = await updateMonthlyExpense(prisma, user, {
      id: created.id,
      expectedUpdatedAt: new Date(row.updatedAt.getTime() - 1000).toISOString(),
      periodMonth: "2026-08",
      categoryId: category.id,
      amount: "2000",
      fundingSource: "BUSINESS",
    });
    expect(result.ok).toBe(false);
  });

  it("archives rather than deletes", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "ADMIN" });
    const created = await createMonthlyExpense(prisma, user, {
      clientUuid: randomUUID(),
      periodMonth: "2026-08",
      categoryId: category.id,
      amount: "1000",
      fundingSource: "BUSINESS",
    });
    if (!created.ok) throw new Error("setup failed");
    const row = await prisma.monthlyExpense.findUniqueOrThrow({ where: { id: created.id } });

    const result = await archiveMonthlyExpense(prisma, user, {
      id: created.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(result.ok).toBe(true);

    const stillExists = await prisma.monthlyExpense.findUnique({ where: { id: created.id } });
    expect(stillExists?.isArchived).toBe(true);
  });
});

describe("generateInstalmentLines (FR-AST-04/05/08, approved decision 3)", () => {
  it("generates exactly one line per active instalment asset for the selected month, with a category and no partner tag", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });
    const asset = await createTestInstalmentAsset({
      userId: user.id,
      defaultCategoryId: category.id,
    });

    const result = await generateInstalmentLines(prisma, user, { periodMonth: "2026-08" });
    expect(result).toEqual({ ok: true, created: 1, alreadyExisted: 0 });

    const row = await prisma.monthlyExpense.findFirstOrThrow({ where: { assetId: asset.id } });
    expect(row.fundingSource).toBe("BUSINESS");
    expect(row.fundedByUserId).toBeNull();
    expect(row.categoryId).toBe(category.id);
    expect(row.amount.toString()).toBe("50000");
  });

  it("is idempotent under genuine concurrency — exactly one active line and one audit row per asset/month", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });
    const asset = await createTestInstalmentAsset({
      userId: user.id,
      defaultCategoryId: category.id,
    });

    const [a, b] = await Promise.all([
      generateInstalmentLines(prisma, user, { periodMonth: "2026-09" }),
      generateInstalmentLines(prisma, user, { periodMonth: "2026-09" }),
    ]);
    const totalCreated = (a.ok ? a.created : 0) + (b.ok ? b.created : 0);
    expect(totalCreated).toBe(1);

    const rows = await prisma.monthlyExpense.findMany({ where: { assetId: asset.id } });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "monthly_expense", entityId: rows[0].id },
    });
    expect(auditCount).toBe(1);
  });

  it("does not regenerate or alter an already-generated month — the candidate list itself excludes it, so a second run is a genuine no-op", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });
    const asset = await createTestInstalmentAsset({
      userId: user.id,
      defaultCategoryId: category.id,
    });

    await generateInstalmentLines(prisma, user, { periodMonth: "2026-08" });
    const second = await generateInstalmentLines(prisma, user, { periodMonth: "2026-08" });
    expect(second).toEqual({ ok: true, created: 0, alreadyExisted: 0 });

    const rows = await prisma.monthlyExpense.count({ where: { assetId: asset.id } });
    expect(rows).toBe(1);
  });

  it("excludes archived assets from future generation", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });
    await createTestInstalmentAsset({
      userId: user.id,
      defaultCategoryId: category.id,
      status: "ARCHIVED",
    });

    const result = await generateInstalmentLines(prisma, user, { periodMonth: "2026-08" });
    expect(result).toEqual({ ok: true, created: 0, alreadyExisted: 0 });
  });

  it("editing an asset's monthly instalment only affects future generation, never an already-recorded month", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });
    const asset = await createTestInstalmentAsset({
      userId: user.id,
      defaultCategoryId: category.id,
      monthlyInstalment: "50000",
    });

    await generateInstalmentLines(prisma, user, { periodMonth: "2026-08" });

    await prisma.asset.update({
      where: { id: asset.id },
      data: { monthlyInstalment: "60000", updatedBy: user.id, updatedAt: new Date() },
    });

    await generateInstalmentLines(prisma, user, { periodMonth: "2026-09" });

    const augustRow = await prisma.monthlyExpense.findFirstOrThrow({
      where: { assetId: asset.id, periodMonth: new Date("2026-08-01") },
    });
    const septemberRow = await prisma.monthlyExpense.findFirstOrThrow({
      where: { assetId: asset.id, periodMonth: new Date("2026-09-01") },
    });
    expect(augustRow.amount.toString()).toBe("50000");
    expect(septemberRow.amount.toString()).toBe("60000");
  });
});

describe("applyRecurringPrefill (FR-MEXP-06)", () => {
  it("pre-fills a recurring category's line from its most recent prior month, requiring explicit confirmation", async () => {
    const user = await partnerUser();
    const category = await prisma.expenseCategory.create({
      data: { name: `Recurring ${randomUUID()}`, expenseGroup: "ADMIN", isRecurring: true },
    });

    await createMonthlyExpense(prisma, user, {
      clientUuid: randomUUID(),
      periodMonth: "2026-07",
      categoryId: category.id,
      amount: "18000",
      fundingSource: "BUSINESS",
    });

    const candidates = await listRecurringPrefillCandidates(prisma, "2026-08");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].amount).toBe("18000");

    const result = await applyRecurringPrefill(prisma, user, {
      periodMonth: "2026-08",
      lines: candidates.map((c) => ({
        categoryId: c.categoryId,
        amount: c.amount,
        fundingSource: c.fundingSource,
        vendorId: c.vendorId ?? undefined,
        description: c.description ?? undefined,
        fundedByUserId: c.fundedByUserId ?? undefined,
      })),
    });
    expect(result).toEqual({ ok: true, created: 1, alreadyExisted: 0 });

    const augustRow = await prisma.monthlyExpense.findFirstOrThrow({
      where: { categoryId: category.id, periodMonth: new Date("2026-08-01") },
    });
    expect(augustRow.amount.toString()).toBe("18000");
  });
});
