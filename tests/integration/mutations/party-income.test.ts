import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestParty } from "../helpers/fixtures";
import {
  createDailyPartyIncomeCell,
  updateDailyPartyIncomeCell,
  archivePartyIncome,
  createCashReceipt,
  createMonthlyPartyBill,
  updateMonthlyPartyBill,
} from "../../../src/server/mutations/party-income";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function operatorUser() {
  const row = await createTestUser({ role: "OPERATOR" });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("createDailyPartyIncomeCell (mandatory safeguard #1)", () => {
  it("creates a new cell and one audit row", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const clientUuid = randomUUID();

    const result = await createDailyPartyIncomeCell(prisma, user, {
      clientUuid,
      partyId: party.id,
      incomeDate: "2026-08-21",
      amount: "1500",
    });

    expect(result).toEqual({ ok: true, id: expect.any(String), replayed: false });
    const rows = await prisma.partyIncome.findMany({ where: { clientUuid } });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "party_income", entityId: rows[0].id },
    });
    expect(auditCount).toBe(1);
  });

  it("replays a sequential retry via the findUnique short-circuit", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const input = {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate: "2026-08-21",
      amount: "1500",
    };

    const first = await createDailyPartyIncomeCell(prisma, user, input);
    const second = await createDailyPartyIncomeCell(prisma, user, input);

    expect(second).toEqual({ ok: true, id: (first as { id: string }).id, replayed: true });
    const rows = await prisma.partyIncome.findMany({ where: { clientUuid: input.clientUuid } });
    expect(rows).toHaveLength(1);
  });

  it("under genuine concurrency (same clientUuid), exactly one row and one audit row exist and both callers succeed", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const input = {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate: "2026-08-21",
      amount: "2200",
    };

    const [a, b] = await Promise.all([
      createDailyPartyIncomeCell(prisma, user, input),
      createDailyPartyIncomeCell(prisma, user, input),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const rows = await prisma.partyIncome.findMany({ where: { clientUuid: input.clientUuid } });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "party_income", entityId: rows[0].id },
    });
    expect(auditCount).toBe(1);
  });

  it("never treats a party_income_active_daily_cell_unique violation (a different clientUuid, same party+day) as idempotent success", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const incomeDate = "2026-08-21";

    const first = await createDailyPartyIncomeCell(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate,
      amount: "1000",
    });
    expect(first.ok).toBe(true);

    // A different clientUuid targeting the same party+day is a genuine
    // business conflict, never a replay.
    const second = await createDailyPartyIncomeCell(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate,
      amount: "9999",
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatch(/already exists/i);
    }
    // Still exactly one row — the conflicting create never committed, and
    // it was never counted as a second audit-free replay either.
    const rows = await prisma.partyIncome.findMany({
      where: { partyId: party.id, incomeDate: new Date(incomeDate) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount.toString()).toBe("1000");
  });
});

describe("updateDailyPartyIncomeCell / archivePartyIncome", () => {
  it("rejects a stale cell edit", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const created = await createDailyPartyIncomeCell(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate: "2026-08-21",
      amount: "1000",
    });
    const row = await prisma.partyIncome.findUniqueOrThrow({
      where: { id: (created as { id: string }).id },
    });

    await prisma.partyIncome.update({
      where: { id: row.id },
      data: { amount: "1100", updatedAt: new Date(Date.now() + 1000) },
    });

    const result = await updateDailyPartyIncomeCell(prisma, user, {
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
      amount: "9999",
    });

    expect(result.ok).toBe(false);
    const unchanged = await prisma.partyIncome.findUniqueOrThrow({ where: { id: row.id } });
    expect(unchanged.amount.toString()).toBe("1100");
  });

  it("archiving then re-creating the same party/day succeeds (clearing a cell is an archive, not a stored zero)", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const created = await createDailyPartyIncomeCell(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate: "2026-08-21",
      amount: "1000",
    });
    const row = await prisma.partyIncome.findUniqueOrThrow({
      where: { id: (created as { id: string }).id },
    });

    const archived = await archivePartyIncome(prisma, user, {
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(archived).toEqual({ ok: true });

    const recreated = await createDailyPartyIncomeCell(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate: "2026-08-21",
      amount: "1500",
    });
    expect(recreated.ok).toBe(true);
  });
});

describe("createCashReceipt (FR-PINC-06)", () => {
  it("allows multiple cash receipts for the same party and day (never restricted by the DAILY-only unique index)", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const incomeDate = "2026-08-21";

    const first = await createCashReceipt(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate,
      amount: "500",
      note: "First receipt",
    });
    const second = await createCashReceipt(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate,
      amount: "700",
      note: "Second receipt, same day",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const rows = await prisma.partyIncome.findMany({
      where: { partyId: party.id, receiptType: "CASH_DIRECT" },
    });
    expect(rows).toHaveLength(2);
  });

  it("replays a retried cash receipt (same clientUuid) via the findUnique short-circuit — no second row, no second audit row", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const input = {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate: "2026-08-21",
      amount: "3300",
      note: "Reception cash",
    };

    const first = await createCashReceipt(prisma, user, input);
    const second = await createCashReceipt(prisma, user, input);

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: true, id: (first as { id: string }).id, replayed: true });

    const rows = await prisma.partyIncome.findMany({ where: { clientUuid: input.clientUuid } });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "party_income", entityId: rows[0].id },
    });
    expect(auditCount).toBe(1);
  });

  it("under genuine concurrency (same clientUuid), exactly one row and one audit row exist and both callers succeed", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const input = {
      clientUuid: randomUUID(),
      partyId: party.id,
      incomeDate: "2026-08-21",
      amount: "1800",
      note: "Concurrent receipt",
    };

    const [a, b] = await Promise.all([
      createCashReceipt(prisma, user, input),
      createCashReceipt(prisma, user, input),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const rows = await prisma.partyIncome.findMany({ where: { clientUuid: input.clientUuid } });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "party_income", entityId: rows[0].id },
    });
    expect(auditCount).toBe(1);
  });
});

describe("createMonthlyPartyBill (FR-PINC-03, Partner-only, one figure per party per month)", () => {
  it("creates a MONTHLY row and one audit row", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });
    const clientUuid = randomUUID();

    const result = await createMonthlyPartyBill(prisma, user, {
      clientUuid,
      partyId: party.id,
      periodMonth: "2026-08",
      amount: "50000",
    });
    expect(result).toEqual({ ok: true, id: expect.any(String), replayed: false });

    const row = await prisma.partyIncome.findUniqueOrThrow({ where: { clientUuid } });
    expect(row.receiptType).toBe("MONTHLY");
    expect(row.incomeDate.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("rejects a second bill for the same party and month, directing to edit instead", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });

    await createMonthlyPartyBill(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      periodMonth: "2026-08",
      amount: "50000",
    });
    const second = await createMonthlyPartyBill(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      periodMonth: "2026-08",
      amount: "55000",
    });
    expect(second.ok).toBe(false);

    const count = await prisma.partyIncome.count({
      where: { partyId: party.id, receiptType: "MONTHLY", isArchived: false },
    });
    expect(count).toBe(1);
  });

  it("replays a retried create (same clientUuid) without creating a duplicate", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });
    const input = {
      clientUuid: randomUUID(),
      partyId: party.id,
      periodMonth: "2026-08",
      amount: "50000",
    };

    const first = await createMonthlyPartyBill(prisma, user, input);
    const second = await createMonthlyPartyBill(prisma, user, input);
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: true, replayed: true });

    const count = await prisma.partyIncome.count({ where: { clientUuid: input.clientUuid } });
    expect(count).toBe(1);
  });

  it("correcting an already-recorded month is an ordinary stale-write-protected edit, never a second row", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });
    const created = await createMonthlyPartyBill(prisma, user, {
      clientUuid: randomUUID(),
      partyId: party.id,
      periodMonth: "2026-08",
      amount: "50000",
    });
    if (!created.ok) throw new Error("setup failed");
    const row = await prisma.partyIncome.findUniqueOrThrow({ where: { id: created.id } });

    const result = await updateMonthlyPartyBill(prisma, user, {
      id: created.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
      amount: "52000",
    });
    expect(result.ok).toBe(true);

    const updated = await prisma.partyIncome.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.amount.toString()).toBe("52000");
    const count = await prisma.partyIncome.count({
      where: { partyId: party.id, receiptType: "MONTHLY" },
    });
    expect(count).toBe(1);
  });
});
