import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestExpenseItem, createTestExpenseCategory } from "../helpers/fixtures";
import { processSyncBatch } from "../../../src/server/sync/upload";
import type { IncomingSyncOperation } from "../../../src/server/sync/apply";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function operatorUser() {
  return createTestUser({ role: "OPERATOR" });
}

async function partnerUser() {
  return createTestUser({ role: "PARTNER", isPartner: true });
}

function createDailyExpenseOp(overrides: Partial<IncomingSyncOperation> = {}): IncomingSyncOperation {
  return {
    operationId: randomUUID(),
    entityType: "daily_expense",
    action: "CREATE",
    clientUuid: randomUUID(),
    payload: {
      clientUuid: randomUUID(),
      expenseDate: "2026-08-21",
      customDescription: "Fuel",
      amount: "500",
      fundingSource: "BUSINESS",
    },
    ...overrides,
  };
}

describe("processSyncBatch — receipt-based replay safety (mandatory decision #3)", () => {
  it("applies a CREATE, writing the business row, one audit row, and one sync_operations receipt", async () => {
    const user = await operatorUser();
    const clientUuid = randomUUID();
    const op = createDailyExpenseOp({
      clientUuid,
      payload: {
        clientUuid,
        expenseDate: "2026-08-21",
        customDescription: "Fuel",
        amount: "500",
        fundingSource: "BUSINESS",
      },
    });

    const [result] = await processSyncBatch(prisma, user.id, [op]);
    expect(result.status).toBe("APPLIED");

    const rows = await prisma.dailyExpense.findMany({ where: { clientUuid } });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "daily_expense", entityId: rows[0].id },
    });
    expect(auditCount).toBe(1);
    const receipt = await prisma.syncOperation.findUnique({
      where: { operationId: op.operationId },
    });
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe("APPLIED");
  });

  it("preserves the offline capturedAt and sets syncedAt to the server-acceptance instant (mandatory decision #4)", async () => {
    const user = await operatorUser();
    const clientUuid = randomUUID();
    const deviceCapturedAt = "2026-08-01T03:15:00.000Z";
    const op = createDailyExpenseOp({
      clientUuid,
      payload: {
        clientUuid,
        expenseDate: "2026-08-01",
        customDescription: "Offline fuel",
        amount: "500",
        fundingSource: "BUSINESS",
        capturedAt: deviceCapturedAt,
      },
    });

    const before = Date.now();
    await processSyncBatch(prisma, user.id, [op]);
    const after = Date.now();

    const row = await prisma.dailyExpense.findFirstOrThrow({ where: { clientUuid } });
    expect(row.capturedAt.toISOString()).toBe(deviceCapturedAt);
    expect(row.syncedAt).not.toBeNull();
    const syncedAtMs = row.syncedAt!.getTime();
    expect(syncedAtMs).toBeGreaterThanOrEqual(before);
    expect(syncedAtMs).toBeLessThanOrEqual(after);
  });

  it("replays a retried operationId with an identical payload verbatim — no second row, no second audit row", async () => {
    const user = await operatorUser();
    const clientUuid = randomUUID();
    const op = createDailyExpenseOp({
      clientUuid,
      payload: {
        clientUuid,
        expenseDate: "2026-08-21",
        customDescription: "Fuel",
        amount: "500",
        fundingSource: "BUSINESS",
      },
    });

    const [first] = await processSyncBatch(prisma, user.id, [op]);
    const [second] = await processSyncBatch(prisma, user.id, [op]);

    expect(second).toEqual(first);
    const rows = await prisma.dailyExpense.findMany({ where: { clientUuid } });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "daily_expense", entityId: rows[0].id },
    });
    expect(auditCount).toBe(1);
    const receiptCount = await prisma.syncOperation.count({
      where: { operationId: op.operationId },
    });
    expect(receiptCount).toBe(1);
  });

  it("rejects a reused operationId carrying different content as OPERATION_ID_REUSED, without touching the original row", async () => {
    const user = await operatorUser();
    const clientUuid = randomUUID();
    const operationId = randomUUID();
    const first = createDailyExpenseOp({
      operationId,
      clientUuid,
      payload: {
        clientUuid,
        expenseDate: "2026-08-21",
        customDescription: "Fuel",
        amount: "500",
        fundingSource: "BUSINESS",
      },
    });
    await processSyncBatch(prisma, user.id, [first]);

    const differentClientUuid = randomUUID();
    const reused = createDailyExpenseOp({
      operationId, // same operationId
      clientUuid: differentClientUuid,
      payload: {
        clientUuid: differentClientUuid,
        expenseDate: "2026-08-22",
        customDescription: "Different content entirely",
        amount: "999",
        fundingSource: "BUSINESS",
      },
    });
    const [result] = await processSyncBatch(prisma, user.id, [reused]);

    expect(result.status).toBe("REJECTED");
    expect(result.body).toMatchObject({ code: "OPERATION_ID_REUSED" });
    const impostorRows = await prisma.dailyExpense.findMany({
      where: { clientUuid: differentClientUuid },
    });
    expect(impostorRows).toHaveLength(0);
  });

  it("reports a genuine stale-write as CONFLICT with the current row and version, not a generic rejection", async () => {
    const user = await operatorUser();
    const item = await createTestExpenseItem();
    const created = await prisma.dailyExpense.create({
      data: {
        clientUuid: randomUUID(),
        expenseDate: new Date("2026-08-21"),
        expenseItemId: item.id,
        amount: "500",
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        syncedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date("2026-08-21T10:00:00.000Z"),
      },
    });

    const staleUpdate: IncomingSyncOperation = {
      operationId: randomUUID(),
      entityType: "daily_expense",
      action: "UPDATE",
      clientUuid: created.clientUuid,
      payload: {
        id: created.id,
        expectedUpdatedAt: "2026-08-20T00:00:00.000Z", // deliberately stale
        expenseDate: "2026-08-21",
        expenseItemId: item.id,
        amount: "700",
        fundingSource: "BUSINESS",
      },
    };

    const [result] = await processSyncBatch(prisma, user.id, [staleUpdate]);
    expect(result.status).toBe("CONFLICT");
    const body = result.body as { current: { id: string }; currentVersion: string };
    expect(body.current.id).toBe(created.id);
    expect(body.currentVersion).toBe(created.updatedAt.toISOString());
  });

  it("rejects an operation the caller's role lacks permission for, without aborting the rest of the batch", async () => {
    const operator = await operatorUser();
    const category = await createTestExpenseCategory();
    const monthlyOp: IncomingSyncOperation = {
      operationId: randomUUID(),
      entityType: "monthly_expense",
      action: "CREATE",
      clientUuid: randomUUID(),
      payload: {
        clientUuid: randomUUID(),
        periodMonth: "2026-08",
        categoryId: category.id,
        amount: "1000",
        fundingSource: "BUSINESS",
      },
    };
    const dailyOp = createDailyExpenseOp();

    const [monthlyResult, dailyResult] = await processSyncBatch(prisma, operator.id, [
      monthlyOp,
      dailyOp,
    ]);

    expect(monthlyResult.status).toBe("REJECTED");
    expect(monthlyResult.body).toMatchObject({ code: "PERMISSION_DENIED" });
    expect(dailyResult.status).toBe("APPLIED");
  });

  it("Partner role can create a monthly expense via sync", async () => {
    const partner = await partnerUser();
    const category = await createTestExpenseCategory();
    const op: IncomingSyncOperation = {
      operationId: randomUUID(),
      entityType: "monthly_expense",
      action: "CREATE",
      clientUuid: randomUUID(),
      payload: {
        clientUuid: randomUUID(),
        periodMonth: "2026-08",
        categoryId: category.id,
        amount: "1000",
        fundingSource: "BUSINESS",
      },
    };
    const [result] = await processSyncBatch(prisma, partner.id, [op]);
    expect(result.status).toBe("APPLIED");
  });
});
