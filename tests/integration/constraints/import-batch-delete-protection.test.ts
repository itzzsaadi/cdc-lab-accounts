import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

/**
 * Mandatory correction #2: `import_batches` is durable, append-only import
 * history — physically delete-protected like every other business/audit
 * table (BR-15/DR-04/CON-04). `import_sessions` is deliberately NOT
 * protected — ephemeral upload infrastructure, same category as
 * sessions/account/verification (see its schema.prisma comment).
 */
describe("import_batches vs import_sessions deletion behavior", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects DELETE on import_batches", async () => {
    const user = await createTestUser({ role: "ADMIN" });
    const batch = await prisma.importBatch.create({
      data: {
        fileHash: "a".repeat(64),
        fileName: "test.xlsx",
        actorUserId: user.id,
        status: "PENDING",
        totalRows: 0,
      },
    });
    await expect(prisma.importBatch.delete({ where: { id: batch.id } })).rejects.toThrow(
      /not permitted/,
    );
  });

  it("allows DELETE on import_sessions (ephemeral upload infrastructure)", async () => {
    const user = await createTestUser({ role: "ADMIN" });
    const batch = await prisma.importBatch.create({
      data: {
        fileHash: "b".repeat(64),
        fileName: "test2.xlsx",
        actorUserId: user.id,
        status: "PENDING",
        totalRows: 0,
      },
    });
    const session = await prisma.importSession.create({
      data: {
        batchId: batch.id,
        fileHash: "b".repeat(64),
        fileBytes: new Uint8Array([1, 2, 3]),
        status: "PENDING",
        createdBy: user.id,
        expiresAt: new Date(Date.now() + 60 * 1000),
      },
    });
    await expect(prisma.importSession.delete({ where: { id: session.id } })).resolves.toBeTruthy();
  });
});
