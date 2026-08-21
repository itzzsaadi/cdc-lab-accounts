import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestParty } from "../helpers/fixtures";
import { getPartyIncomeReport } from "../../../src/server/queries/party-income";
import { PermissionDeniedError } from "../../../src/lib/permissions/guard";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

/** FR-RPT-05/FR-PINC-08 — income by party across an arbitrary date range. */
describe("getPartyIncomeReport", () => {
  it("combines daily, monthly, and cash-receipt components per party across a custom range spanning two months", async () => {
    const user = await partnerUser();
    const dailyParty = await createTestParty({ billingMode: "DAILY" });
    const monthlyParty = await createTestParty({ billingMode: "MONTHLY" });

    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: dailyParty.id,
        incomeDate: new Date("2026-07-20"),
        amount: "2000",
        receiptType: "DAILY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: dailyParty.id,
        incomeDate: new Date("2026-08-05"),
        amount: "500",
        receiptType: "CASH_DIRECT",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: monthlyParty.id,
        incomeDate: new Date("2026-07-01"),
        amount: "40000",
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
        partyId: monthlyParty.id,
        incomeDate: new Date("2026-08-01"),
        amount: "45000",
        receiptType: "MONTHLY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    // A range spanning July 25 – August 10: literal for DAILY/CASH_DIRECT,
    // but touches both July and August for the month-anchored MONTHLY rows.
    const report = await getPartyIncomeReport(prisma, user, {
      from: "2026-07-25",
      to: "2026-08-10",
    });

    const dailyRow = report.parties.find((p) => p.partyId === dailyParty.id)!;
    expect(dailyRow.dailyTotal).toBe("0"); // July 20 daily row is outside the literal range
    expect(dailyRow.cashReceiptsTotal).toBe("500");
    expect(dailyRow.combinedTotal).toBe("500");

    const monthlyRow = report.parties.find((p) => p.partyId === monthlyParty.id)!;
    expect(monthlyRow.monthlyTotal).toBe("85000"); // both July and August bills
    expect(monthlyRow.combinedTotal).toBe("85000");

    expect(report.grandTotal).toBe("85500");
  });

  it("shows a party with zero income in the range, never omitted", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "DAILY" });

    const report = await getPartyIncomeReport(prisma, user, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    const row = report.parties.find((p) => p.partyId === party.id)!;
    expect(row).toBeDefined();
    expect(row.combinedTotal).toBe("0");
  });

  it("includes an archived-but-historical party with a live row in range", async () => {
    const user = await partnerUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate: new Date("2026-08-05"),
        amount: "750",
        receiptType: "DAILY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.party.update({ where: { id: party.id }, data: { isActive: false } });

    const report = await getPartyIncomeReport(prisma, user, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    const row = report.parties.find((p) => p.partyId === party.id)!;
    expect(row).toBeDefined();
    expect(row.isActive).toBe(false);
    expect(row.dailyTotal).toBe("750");
  });

  it("denies an OPERATOR (report:financial-summary is Partner-minimum, FR-AUTH-04)", async () => {
    const operator = await createTestUser({ role: "OPERATOR", isPartner: false });
    await expect(
      getPartyIncomeReport(prisma, operator, { from: "2026-08-01", to: "2026-08-31" }),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
