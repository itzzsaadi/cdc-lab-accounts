import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

describe("audit_log append-only (FR-AUD-03) — database trigger, not just code discipline", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects an UPDATE against audit_log", async () => {
    const user = await createTestUser();
    const entry = await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "parties",
        entityId: "some-id",
        capturedAt: new Date(),
      },
    });
    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { entityType: "vendors" } }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects a DELETE against audit_log", async () => {
    const user = await createTestUser();
    const entry = await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "parties",
        entityId: "some-id",
        capturedAt: new Date(),
      },
    });
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it("records a failed login against an unknown email without violating entity_id NOT NULL", async () => {
    const entry = await prisma.auditLog.create({
      data: {
        actorUserId: null,
        action: "LOGIN_FAILED",
        entityType: "auth",
        entityId: "unknown",
        newValues: { attempted_email: "nobody@example.test" },
        capturedAt: new Date(),
      },
    });
    expect(entry.actorUserId).toBeNull();
    expect(entry.entityId).toBe("unknown");
    expect(entry.newValues).toEqual({ attempted_email: "nobody@example.test" });
  });
});
