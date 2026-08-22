import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import {
  cleanupExpiredSyncReceipts,
  RECEIPT_RETENTION_DAYS,
} from "../../../src/server/sync/retention";
import { PermissionDeniedError } from "../../../src/lib/permissions/guard";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function makeReceipt(actorUserId: string, createdAt: Date) {
  return prisma.syncOperation.create({
    data: {
      operationId: randomUUID(),
      actorUserId,
      entityType: "daily_expense",
      clientUuid: randomUUID(),
      action: "CREATE",
      requestFingerprint: "a".repeat(64),
      status: "APPLIED",
      resultBody: { id: randomUUID(), replayed: false },
      createdAt,
    },
  });
}

describe("cleanupExpiredSyncReceipts (mandatory decision #5)", () => {
  it("deletes only receipts strictly older than the retention window", async () => {
    const admin = await createTestUser({ role: "ADMIN", isPartner: true });
    const oldEnough = new Date(Date.now() - (RECEIPT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
    const notOldEnough = new Date(Date.now() - (RECEIPT_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000);
    const old = await makeReceipt(admin.id, oldEnough);
    const recent = await makeReceipt(admin.id, notOldEnough);

    const result = await cleanupExpiredSyncReceipts(prisma, admin);

    expect(result.deletedCount).toBe(1);
    const oldStillThere = await prisma.syncOperation.findUnique({
      where: { operationId: old.operationId },
    });
    const recentStillThere = await prisma.syncOperation.findUnique({
      where: { operationId: recent.operationId },
    });
    expect(oldStillThere).toBeNull();
    expect(recentStillThere).not.toBeNull();
  });

  it("never deletes anything at exactly the retention boundary or newer", async () => {
    const admin = await createTestUser({ role: "ADMIN", isPartner: true });
    const justInside = new Date(Date.now() - (RECEIPT_RETENTION_DAYS - 0.01) * 24 * 60 * 60 * 1000);
    await makeReceipt(admin.id, justInside);

    const result = await cleanupExpiredSyncReceipts(prisma, admin);
    expect(result.deletedCount).toBe(0);
  });

  it("is Admin-only", async () => {
    const operator = await createTestUser({ role: "OPERATOR" });
    await expect(cleanupExpiredSyncReceipts(prisma, operator)).rejects.toThrow(
      PermissionDeniedError,
    );
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });
    await expect(cleanupExpiredSyncReceipts(prisma, partner)).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});
