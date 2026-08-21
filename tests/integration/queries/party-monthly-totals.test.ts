import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestParty } from "../helpers/fixtures";
import { getPartyMonthlyTotals } from "../../../src/server/queries/party-income";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

/** FR-PINC-07/08 (Phase 4 completion) — daily + monthly + cash receipts, combined per party. */
describe("getPartyMonthlyTotals", () => {
  it("combines the monthly bill and cash receipts for a monthly-billing party", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });

    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate: new Date("2026-08-01"),
        amount: "50000",
        receiptType: "MONTHLY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate: new Date("2026-08-10"),
        amount: "1500",
        receiptType: "CASH_DIRECT",
        note: "Direct cash",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    const totals = await getPartyMonthlyTotals(prisma, user, "2026-08");
    const row = totals.find((t) => t.partyId === party.id)!;
    expect(row.dailyTotal).toBe("0");
    expect(row.monthlyBill?.amount).toBe("50000");
    expect(row.cashReceiptsTotal).toBe("1500");
    expect(row.combinedTotal).toBe("51500");
  });

  it("combines daily entries and cash receipts for a daily-billing party (no monthly bill)", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "DAILY" });

    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate: new Date("2026-08-05"),
        amount: "2000",
        receiptType: "DAILY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    const totals = await getPartyMonthlyTotals(prisma, user, "2026-08");
    const row = totals.find((t) => t.partyId === party.id)!;
    expect(row.monthlyBill).toBeNull();
    expect(row.dailyTotal).toBe("2000");
    expect(row.combinedTotal).toBe("2000");
  });

  it("shows a party with no income this month as zero, not omitted (FR-PINC-09)", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });

    const totals = await getPartyMonthlyTotals(prisma, user, "2026-08");
    const row = totals.find((t) => t.partyId === party.id)!;
    expect(row).toBeDefined();
    expect(row.combinedTotal).toBe("0");
  });
});
