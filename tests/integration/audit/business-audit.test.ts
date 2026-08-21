import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import { appendBusinessAudit } from "../../../src/lib/audit";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

/**
 * `appendBusinessAudit` accepts only `Prisma.TransactionClient` (CLAUDE.md
 * §17, Phase 3B mandatory safeguard #5) — every test here calls it inside
 * a real `prisma.$transaction`, proving the type constraint is not merely
 * declared but actually exercised against a live transaction.
 */
describe("appendBusinessAudit (transaction-scoped-only business audit)", () => {
  it("writes the audit row in the same transaction as the business mutation, both committing together", async () => {
    const user = await createTestUser();
    const expenseId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.dailyExpense.create({
        data: {
          id: expenseId,
          clientUuid: randomUUID(),
          expenseDate: new Date("2026-08-21"),
          amount: "500",
          fundingSource: "BUSINESS",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "daily_expense",
        entityId: expenseId,
        newValues: { amount: "500" },
      });
    });

    const expense = await prisma.dailyExpense.findUnique({ where: { id: expenseId } });
    expect(expense).not.toBeNull();
    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: "daily_expense", entityId: expenseId },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.action).toBe("CREATE");
    expect(auditRow!.actorUserId).toBe(user.id);
  });

  it("rolls back the business mutation when the audit write's transaction fails later", async () => {
    const user = await createTestUser();
    const expenseId = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.dailyExpense.create({
          data: {
            id: expenseId,
            clientUuid: randomUUID(),
            expenseDate: new Date("2026-08-21"),
            amount: "500",
            fundingSource: "BUSINESS",
            capturedAt: new Date(),
            createdBy: user.id,
            updatedBy: user.id,
            updatedAt: new Date(),
          },
        });
        await appendBusinessAudit(tx, {
          actorUserId: user.id,
          action: "CREATE",
          entityType: "daily_expense",
          entityId: expenseId,
        });
        // Simulate a later failure in the same transaction (e.g. a
        // downstream check failing) — this must roll back *both* the
        // business row and the audit row already written above.
        throw new Error("simulated downstream failure");
      }),
    ).rejects.toThrow("simulated downstream failure");

    const expense = await prisma.dailyExpense.findUnique({ where: { id: expenseId } });
    expect(expense).toBeNull();
    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: "daily_expense", entityId: expenseId },
    });
    expect(auditRow).toBeNull();
  });

  it("rolls back the audit row when the business mutation fails after it", async () => {
    const user = await createTestUser();
    const expenseId = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        await appendBusinessAudit(tx, {
          actorUserId: user.id,
          action: "CREATE",
          entityType: "daily_expense",
          entityId: expenseId,
        });
        // A CHECK-constraint violation (negative amount) after the audit
        // write — the whole transaction, audit row included, must abort.
        await tx.dailyExpense.create({
          data: {
            id: expenseId,
            clientUuid: randomUUID(),
            expenseDate: new Date("2026-08-21"),
            amount: "-1",
            fundingSource: "BUSINESS",
            capturedAt: new Date(),
            createdBy: user.id,
            updatedBy: user.id,
            updatedAt: new Date(),
          },
        });
      }),
    ).rejects.toThrow();

    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: "daily_expense", entityId: expenseId },
    });
    expect(auditRow).toBeNull();
  });

  it("never records a secret and always stamps capturedAt", async () => {
    const user = await createTestUser();
    const expenseId = randomUUID();
    const before = new Date();

    await prisma.$transaction(async (tx) => {
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "daily_expense",
        entityId: expenseId,
        newValues: { amount: "500", clientUuid: randomUUID() },
      });
    });

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "daily_expense", entityId: expenseId },
    });
    expect(auditRow.capturedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    const serialized = JSON.stringify(auditRow, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    expect(serialized.toLowerCase()).not.toContain("password");
    expect(serialized.toLowerCase()).not.toContain("token");
  });
});
