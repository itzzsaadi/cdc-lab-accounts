import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestExpenseItem } from "../helpers/fixtures";
import {
  createDailyExpense,
  updateDailyExpense,
  archiveDailyExpense,
} from "../../../src/server/mutations/daily-expenses";
import { PermissionDeniedError } from "../../../src/lib/permissions/guard";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function operatorUser() {
  const row = await createTestUser({ role: "OPERATOR" });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("createDailyExpense (mandatory safeguard #1: concurrent-safe idempotency)", () => {
  it("creates a new row and one audit row on first submission", async () => {
    const user = await operatorUser();
    const item = await createTestExpenseItem();
    const clientUuid = randomUUID();

    const result = await createDailyExpense(prisma, user, {
      clientUuid,
      expenseDate: "2026-08-21",
      expenseItemId: item.id,
      amount: "500",
      fundingSource: "BUSINESS",
    });

    expect(result).toEqual({ ok: true, id: expect.any(String), replayed: false });
    const rows = await prisma.dailyExpense.findMany({ where: { clientUuid } });
    expect(rows).toHaveLength(1);
    const auditRows = await prisma.auditLog.count({
      where: { entityType: "daily_expense", entityId: rows[0].id },
    });
    expect(auditRows).toBe(1);
  });

  it("replays a sequential retry (same clientUuid) via the findUnique short-circuit — no second row, no second audit row", async () => {
    const user = await operatorUser();
    const item = await createTestExpenseItem();
    const clientUuid = randomUUID();
    const input = {
      clientUuid,
      expenseDate: "2026-08-21",
      expenseItemId: item.id,
      amount: "500",
      fundingSource: "BUSINESS" as const,
    };

    const first = await createDailyExpense(prisma, user, input);
    const second = await createDailyExpense(prisma, user, input);

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: true, id: (first as { id: string }).id, replayed: true });

    const rows = await prisma.dailyExpense.findMany({ where: { clientUuid } });
    expect(rows).toHaveLength(1);
    const auditRows = await prisma.auditLog.count({
      where: { entityType: "daily_expense", entityId: rows[0].id },
    });
    expect(auditRows).toBe(1);
  });

  it("under genuine concurrency (both requests race past findUnique), exactly one row and one audit row exist, and both callers receive a successful result", async () => {
    const user = await operatorUser();
    const item = await createTestExpenseItem();
    const clientUuid = randomUUID();
    const input = {
      clientUuid,
      expenseDate: "2026-08-21",
      expenseItemId: item.id,
      amount: "750",
      fundingSource: "BUSINESS" as const,
    };

    // Both calls start from an empty table — the findUnique in each will
    // see no row, so both proceed to `create`; the database's own unique
    // constraint on client_uuid is what actually prevents a duplicate.
    const [a, b] = await Promise.all([
      createDailyExpense(prisma, user, input),
      createDailyExpense(prisma, user, input),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const ids = [a, b].map((r) => (r as { id: string }).id);
    expect(ids[0]).toBe(ids[1]); // same winning row, not two different ids

    const rows = await prisma.dailyExpense.findMany({ where: { clientUuid } });
    expect(rows).toHaveLength(1);
    const auditRows = await prisma.auditLog.count({
      where: { entityType: "daily_expense", entityId: rows[0].id },
    });
    expect(auditRows).toBe(1);

    // Exactly one of the two results is the "winner" (replayed: false) and
    // the other observed the loser's P2002 and replayed.
    const replayFlags = [a, b].map((r) => (r as { replayed: boolean }).replayed).sort();
    expect(replayFlags).toEqual([false, true]);
  });

  it("rejects with no user (unauthenticated)", async () => {
    await expect(
      createDailyExpense(prisma, null, {
        clientUuid: randomUUID(),
        expenseDate: "2026-08-21",
        customDescription: "x",
        amount: "1",
        fundingSource: "BUSINESS",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("rejects for a deactivated account even with a well-formed request", async () => {
    const user = await createTestUser({ role: "OPERATOR" });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const deactivated = {
      id: user.id,
      role: user.role,
      isPartner: user.isPartner,
      isActive: false,
    };

    await expect(
      createDailyExpense(prisma, deactivated, {
        clientUuid: randomUUID(),
        expenseDate: "2026-08-21",
        customDescription: "x",
        amount: "1",
        fundingSource: "BUSINESS",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("updateDailyExpense (atomic conditional write — stale-write protection)", () => {
  it("accepts an edit when expectedUpdatedAt matches the current row", async () => {
    const user = await operatorUser();
    const item = await createTestExpenseItem();
    const created = await createDailyExpense(prisma, user, {
      clientUuid: randomUUID(),
      expenseDate: "2026-08-21",
      expenseItemId: item.id,
      amount: "500",
      fundingSource: "BUSINESS",
    });
    const row = await prisma.dailyExpense.findUniqueOrThrow({
      where: { id: (created as { id: string }).id },
    });

    const result = await updateDailyExpense(prisma, user, {
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
      expenseDate: "2026-08-22",
      expenseItemId: item.id,
      amount: "600",
      fundingSource: "BUSINESS",
    });

    expect(result).toEqual({ ok: true });
    const updated = await prisma.dailyExpense.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.amount.toString()).toBe("600");
  });

  it("rejects a stale edit (expectedUpdatedAt no longer matches) without applying it", async () => {
    const user = await operatorUser();
    const item = await createTestExpenseItem();
    const created = await createDailyExpense(prisma, user, {
      clientUuid: randomUUID(),
      expenseDate: "2026-08-21",
      expenseItemId: item.id,
      amount: "500",
      fundingSource: "BUSINESS",
    });
    const row = await prisma.dailyExpense.findUniqueOrThrow({
      where: { id: (created as { id: string }).id },
    });

    // Someone else updates the row first.
    await prisma.dailyExpense.update({
      where: { id: row.id },
      data: { amount: "550", updatedBy: user.id, updatedAt: new Date(Date.now() + 1000) },
    });

    const result = await updateDailyExpense(prisma, user, {
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(), // stale — the real row moved on
      expenseDate: "2026-08-22",
      expenseItemId: item.id,
      amount: "999",
      fundingSource: "BUSINESS",
    });

    expect(result.ok).toBe(false);
    const unchanged = await prisma.dailyExpense.findUniqueOrThrow({ where: { id: row.id } });
    expect(unchanged.amount.toString()).toBe("550");
  });

  it("rejects an edit to an already-archived row", async () => {
    const user = await operatorUser();
    const item = await createTestExpenseItem();
    const created = await createDailyExpense(prisma, user, {
      clientUuid: randomUUID(),
      expenseDate: "2026-08-21",
      expenseItemId: item.id,
      amount: "500",
      fundingSource: "BUSINESS",
    });
    const row = await prisma.dailyExpense.findUniqueOrThrow({
      where: { id: (created as { id: string }).id },
    });

    await archiveDailyExpense(prisma, user, {
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });

    const result = await updateDailyExpense(prisma, user, {
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
      expenseDate: "2026-08-22",
      expenseItemId: item.id,
      amount: "999",
      fundingSource: "BUSINESS",
    });

    expect(result.ok).toBe(false);
  });
});

describe("archiveDailyExpense", () => {
  it("archives via updateMany and writes exactly one ARCHIVE audit row", async () => {
    const user = await operatorUser();
    const item = await createTestExpenseItem();
    const created = await createDailyExpense(prisma, user, {
      clientUuid: randomUUID(),
      expenseDate: "2026-08-21",
      expenseItemId: item.id,
      amount: "500",
      fundingSource: "BUSINESS",
    });
    const row = await prisma.dailyExpense.findUniqueOrThrow({
      where: { id: (created as { id: string }).id },
    });

    const result = await archiveDailyExpense(prisma, user, {
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });

    expect(result).toEqual({ ok: true });
    const archived = await prisma.dailyExpense.findUniqueOrThrow({ where: { id: row.id } });
    expect(archived.isArchived).toBe(true);
    const archiveAuditCount = await prisma.auditLog.count({
      where: { entityType: "daily_expense", entityId: row.id, action: "ARCHIVE" },
    });
    expect(archiveAuditCount).toBe(1);
  });
});
