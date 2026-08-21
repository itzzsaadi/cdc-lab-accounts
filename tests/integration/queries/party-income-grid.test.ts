import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestParty, createTestPartyIncome } from "../helpers/fixtures";
import { getPartyIncomeGrid } from "../../../src/server/queries/party-income";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function operatorUser() {
  const row = await createTestUser({ role: "OPERATOR" });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("getPartyIncomeGrid (FR-PINC-02/07/08/09, mandatory safeguard #6)", () => {
  it("includes every currently-active daily-billing party, with a null cell for days with no entry", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });

    const grid = await getPartyIncomeGrid(prisma, user, "2026-08");

    expect(grid.parties.map((p) => p.id)).toContain(party.id);
    expect(grid.parties.find((p) => p.id === party.id)!.isActive).toBe(true);
    expect(grid.days).toHaveLength(31);
    expect(grid.cells[party.id]["2026-08-15"]).toBeNull();
  });

  it("excludes a monthly-billing party entirely (grid columns are daily-billing parties only)", async () => {
    const user = await operatorUser();
    await createTestParty({ billingMode: "MONTHLY" });

    const grid = await getPartyIncomeGrid(prisma, user, "2026-08");

    expect(grid.parties).toHaveLength(0);
  });

  it("excludes an archived daily-billing party with no history in the selected month", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    await prisma.party.update({ where: { id: party.id }, data: { isActive: false } });

    const grid = await getPartyIncomeGrid(prisma, user, "2026-08");

    expect(grid.parties.map((p) => p.id)).not.toContain(party.id);
  });

  it("includes an archived daily-billing party as read-only-flagged when it has non-archived history in the selected month", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    await createTestPartyIncome({
      userId: user.id,
      partyId: party.id,
      incomeDate: new Date("2026-08-10"),
      amount: "1234",
    });
    await prisma.party.update({ where: { id: party.id }, data: { isActive: false } });

    const grid = await getPartyIncomeGrid(prisma, user, "2026-08");

    const gridParty = grid.parties.find((p) => p.id === party.id);
    expect(gridParty).toBeDefined();
    expect(gridParty!.isActive).toBe(false);
    expect(grid.cells[party.id]["2026-08-10"]?.amount).toBe("1234");
  });

  it("excludes an archived daily-billing party whose only history is *archived* (is_archived on the entry, not just the party)", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const row = await createTestPartyIncome({
      userId: user.id,
      partyId: party.id,
      incomeDate: new Date("2026-08-10"),
      amount: "1234",
    });
    await prisma.partyIncome.update({ where: { id: row.id }, data: { isArchived: true } });
    await prisma.party.update({ where: { id: party.id }, data: { isActive: false } });

    const grid = await getPartyIncomeGrid(prisma, user, "2026-08");

    expect(grid.parties.map((p) => p.id)).not.toContain(party.id);
  });

  it("computes correct per-party and grand totals across multiple cells", async () => {
    const user = await operatorUser();
    const partyA = await createTestParty({ billingMode: "DAILY" });
    const partyB = await createTestParty({ billingMode: "DAILY" });
    await createTestPartyIncome({
      userId: user.id,
      partyId: partyA.id,
      incomeDate: new Date("2026-08-01"),
      amount: "1000",
    });
    await createTestPartyIncome({
      userId: user.id,
      partyId: partyA.id,
      incomeDate: new Date("2026-08-02"),
      amount: "500.50",
    });
    await createTestPartyIncome({
      userId: user.id,
      partyId: partyB.id,
      incomeDate: new Date("2026-08-01"),
      amount: "2000",
    });

    const grid = await getPartyIncomeGrid(prisma, user, "2026-08");

    expect(grid.partyTotals[partyA.id]).toBe("1500.5");
    expect(grid.partyTotals[partyB.id]).toBe("2000");
    expect(grid.grandTotal).toBe("3500.5");
  });

  it("never includes a CASH_DIRECT row in the grid's cells (grid is DAILY-receipt-type only)", async () => {
    const user = await operatorUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    await createTestPartyIncome({
      userId: user.id,
      partyId: party.id,
      incomeDate: new Date("2026-08-05"),
      amount: "999",
      receiptType: "CASH_DIRECT",
      note: "Cash",
    });

    const grid = await getPartyIncomeGrid(prisma, user, "2026-08");

    expect(grid.cells[party.id]["2026-08-05"]).toBeNull();
    expect(grid.grandTotal).toBe("0");
  });
});
