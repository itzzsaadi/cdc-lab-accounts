import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import {
  createCounterIncome,
  archiveCounterIncome,
} from "../../../src/server/mutations/counter-income";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function operatorUser() {
  const row = await createTestUser({ role: "OPERATOR" });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("createCounterIncome — FR-CINC-04 two-step duplicate confirmation", () => {
  it("creates freely when no entry exists yet for the date", async () => {
    const user = await operatorUser();
    const result = await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "3000",
    });
    expect(result.ok).toBe(true);
  });

  it("warns without creating when a non-archived entry already exists for that date, unconfirmed", async () => {
    const user = await operatorUser();
    await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "3000",
    });

    const second = await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "4000",
    });

    expect(second.ok).toBe(false);
    expect(second).toMatchObject({ requiresConfirmation: true, existingAmount: "3000" });
    const rows = await prisma.counterIncome.findMany({
      where: { incomeDate: new Date("2026-08-21") },
    });
    expect(rows).toHaveLength(1); // the second one was never created
  });

  it("proceeds and creates a second row once confirmedDuplicate is true", async () => {
    const user = await operatorUser();
    await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "3000",
    });

    const second = await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "4000",
      confirmedDuplicate: true,
    });

    expect(second.ok).toBe(true);
    const rows = await prisma.counterIncome.findMany({
      where: { incomeDate: new Date("2026-08-21") },
    });
    expect(rows).toHaveLength(2);
  });

  it("does not re-warn for a duplicate that is only archived (archived rows don't count as a same-day conflict)", async () => {
    const user = await operatorUser();
    const created = await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "3000",
    });
    const row = await prisma.counterIncome.findUniqueOrThrow({
      where: { id: (created as { id: string }).id },
    });
    await archiveCounterIncome(prisma, user, {
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });

    const second = await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "5000",
    });

    expect(second.ok).toBe(true);
  });

  it("a retried request (same clientUuid) is always a replay, never re-shown the duplicate warning", async () => {
    const user = await operatorUser();
    await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "3000",
    });

    const clientUuid = randomUUID();
    const input = { clientUuid, incomeDate: "2026-08-21", amount: "4000" };
    const first = await createCounterIncome(prisma, user, { ...input, confirmedDuplicate: true });
    expect(first.ok).toBe(true);

    // Retry with the exact same clientUuid, no confirmedDuplicate this
    // time — still a plain replay, not a fresh warning.
    const retry = await createCounterIncome(prisma, user, input);
    expect(retry).toEqual({ ok: true, id: (first as { id: string }).id, replayed: true });
  });

  it("accepts a zero amount — the one table with CHECK (amount >= 0)", async () => {
    const user = await operatorUser();
    const result = await createCounterIncome(prisma, user, {
      clientUuid: randomUUID(),
      incomeDate: "2026-08-21",
      amount: "0",
    });
    expect(result.ok).toBe(true);
  });
});
