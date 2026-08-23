import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestExpenseItem } from "../helpers/fixtures";
import type { AuthenticatedUser } from "../../../src/lib/permissions/guard";
import {
  createDailyExpense,
  updateDailyExpense,
  archiveDailyExpense,
} from "../../../src/server/mutations/daily-expenses";
import { listAuditLog, getEntityHistory } from "../../../src/server/queries/audit-log";
import { processSyncBatch } from "../../../src/server/sync/upload";
import type { IncomingSyncOperation } from "../../../src/server/sync/apply";

const prisma = getTestPrismaClient();

function asPartner(id: string): AuthenticatedUser {
  return { id, role: "PARTNER", isPartner: true, isActive: true };
}

/**
 * Phase 8A — the internal half of **AC-11**: "the change history correctly
 * reflects a representative sample of additions, edits and archivals,
 * including one made offline."
 *
 * The pieces have existed since Phases 3, 5, and 6, each tested in
 * isolation. What was missing is the criterion itself: one run that
 * produces a representative sample *and then reads the Change History
 * screen's own query* to confirm it reflects them. That end-to-end shape
 * is what AC-11 asks to be demonstrated, and it is also what finally
 * closes **FR-AUD-08** ("an offline-made entry records both capture time
 * and upload time") at the acceptance level rather than only at the
 * mutation level.
 *
 * The client-facing demonstration of AC-11 remains a Phase 8B sign-off
 * item — this proves the system does it; a person still has to watch it.
 */
describe("AC-11 — change history reflects additions, edits, archivals, and an offline entry", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("records CREATE, UPDATE, and ARCHIVE for one record, in order, readable from the Change History query", async () => {
    const actor = await createTestUser({ role: "PARTNER", isPartner: true });
    const user = asPartner(actor.id);
    const item = await createTestExpenseItem();

    const created = await createDailyExpense(prisma, user, {
      clientUuid: randomUUID(),
      expenseDate: "2026-07-10",
      expenseItemId: item.id,
      amount: "400.00",
      fundingSource: "BUSINESS",
    });
    expect(created.ok).toBe(true);
    const id = (created as { id: string }).id;

    let row = await prisma.dailyExpense.findUniqueOrThrow({ where: { id } });
    const updated = await updateDailyExpense(prisma, user, {
      id,
      expenseDate: "2026-07-10",
      expenseItemId: item.id,
      amount: "450.00",
      fundingSource: "BUSINESS",
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(updated.ok).toBe(true);

    row = await prisma.dailyExpense.findUniqueOrThrow({ where: { id } });
    const archived = await archiveDailyExpense(prisma, user, {
      id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(archived.ok).toBe(true);

    // Read it back the way the Change History screen does, not straight
    // from the table — a history nobody can retrieve is not a history.
    const history = await getEntityHistory(prisma, user, "daily_expense", id);
    expect(history.map((entry) => entry.action)).toEqual(["CREATE", "UPDATE", "ARCHIVE"]);

    const edit = history.find((entry) => entry.action === "UPDATE");
    expect(edit, "the edit must record what changed, not merely that something did").toBeTruthy();
    expect(JSON.stringify(edit)).toContain("450");
  });

  it("an offline-made entry records both its device capture time and its later upload time (FR-AUD-08)", async () => {
    const actor = await createTestUser({ role: "PARTNER", isPartner: true });
    const item = await createTestExpenseItem();

    // A device that captured the entry two hours before it reconnected.
    const deviceCapturedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const clientUuid = randomUUID();
    const operation = {
      operationId: randomUUID(),
      entityType: "daily_expense",
      action: "CREATE",
      clientUuid,
      payload: {
        clientUuid,
        expenseDate: "2026-07-11",
        expenseItemId: item.id,
        amount: "275.00",
        fundingSource: "BUSINESS",
        // The device's own capture time travels inside the payload, which
        // is what the mutation reads — an operation-level field would be
        // silently ignored (verified by this test failing that way first).
        capturedAt: deviceCapturedAt,
      },
    } as IncomingSyncOperation;

    const [result] = await processSyncBatch(prisma, actor.id, [operation]);
    expect(result?.status).toBe("APPLIED");

    const row = await prisma.dailyExpense.findFirstOrThrow({ where: { clientUuid } });
    expect(row.capturedAt.toISOString()).toBe(deviceCapturedAt);
    expect(row.syncedAt).not.toBeNull();
    // The two must be genuinely different — one server timestamp written
    // to both columns would satisfy a naive "not null" check while telling
    // the reader nothing about when the work actually happened.
    expect(row.syncedAt!.getTime()).toBeGreaterThan(row.capturedAt.getTime());

    const history = await getEntityHistory(prisma, asPartner(actor.id), "daily_expense", row.id);
    expect(history.map((entry) => entry.action)).toContain("CREATE");
  });

  it("the Change History list shows a representative mixed sample, filterable by record type", async () => {
    const actor = await createTestUser({ role: "PARTNER", isPartner: true });
    const user = asPartner(actor.id);
    const item = await createTestExpenseItem();

    for (const amount of ["100.00", "200.00", "300.00"]) {
      await createDailyExpense(prisma, user, {
        clientUuid: randomUUID(),
        expenseDate: "2026-07-12",
        expenseItemId: item.id,
        amount,
        fundingSource: "BUSINESS",
      });
    }

    const all = await listAuditLog(prisma, user, {});
    expect(all.items.length).toBeGreaterThanOrEqual(3);

    const filtered = await listAuditLog(prisma, user, { entityType: "daily_expense" });
    expect(filtered.items.length).toBeGreaterThanOrEqual(3);
    expect(filtered.items.every((entry) => entry.entityType === "daily_expense")).toBe(true);

    const unrelated = await listAuditLog(prisma, user, { entityType: "asset" });
    expect(unrelated.items).toHaveLength(0);
  });
});
