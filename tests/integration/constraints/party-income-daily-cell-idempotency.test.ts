import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestParty } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

function dailyRow(overrides: {
  partyId: string;
  userId: string;
  incomeDate: Date;
  amount: string;
}) {
  return {
    clientUuid: randomUUID(),
    partyId: overrides.partyId,
    incomeDate: overrides.incomeDate,
    amount: overrides.amount,
    receiptType: "DAILY" as const,
    capturedAt: new Date(),
    createdBy: overrides.userId,
    updatedBy: overrides.userId,
    updatedAt: new Date(),
  };
}

/**
 * `party_income_active_daily_cell_unique` (Phase 3B migration
 * 20260821070503) — mirrors instalment-idempotency.test.ts's structure for
 * the analogous partial-unique-index invariant on the Party Income grid.
 */
describe("party_income_active_daily_cell_unique (FR-PINC-02, mandatory safeguard #4)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a second active DAILY row for the same party and day", async () => {
    const user = await createTestUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const incomeDate = new Date("2026-08-21");

    await prisma.partyIncome.create({
      data: dailyRow({ partyId: party.id, userId: user.id, incomeDate, amount: "1000" }),
    });

    await expect(
      prisma.partyIncome.create({
        data: dailyRow({ partyId: party.id, userId: user.id, incomeDate, amount: "2000" }),
      }),
    ).rejects.toThrow();
  });

  it("allows archive-then-correct: archiving the wrong cell permits a corrected replacement", async () => {
    const user = await createTestUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const incomeDate = new Date("2026-08-21");

    const wrong = await prisma.partyIncome.create({
      data: dailyRow({ partyId: party.id, userId: user.id, incomeDate, amount: "900" }),
    });

    await prisma.partyIncome.update({
      where: { id: wrong.id },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });

    const corrected = await prisma.partyIncome.create({
      data: dailyRow({ partyId: party.id, userId: user.id, incomeDate, amount: "1250" }),
    });

    expect(corrected.amount.toString()).toBe("1250");
    const historicalRowCount = await prisma.partyIncome.count({
      where: { partyId: party.id, incomeDate },
    });
    expect(historicalRowCount).toBe(2);
  });

  it("does not restrict multiple CASH_DIRECT rows for the same party and day", async () => {
    const user = await createTestUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const incomeDate = new Date("2026-08-21");

    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate,
        amount: "500",
        receiptType: "CASH_DIRECT",
        note: "First receipt",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    await expect(
      prisma.partyIncome.create({
        data: {
          clientUuid: randomUUID(),
          partyId: party.id,
          incomeDate,
          amount: "750",
          receiptType: "CASH_DIRECT",
          note: "Second receipt, same day",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("does not restrict a MONTHLY row sharing a party/date with an active DAILY row", async () => {
    const user = await createTestUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });
    const incomeDate = new Date("2026-08-01");

    await prisma.partyIncome.create({
      data: dailyRow({ partyId: party.id, userId: user.id, incomeDate, amount: "1000" }),
    });

    await expect(
      prisma.partyIncome.create({
        data: {
          clientUuid: randomUUID(),
          partyId: party.id,
          incomeDate,
          amount: "40000",
          receiptType: "MONTHLY",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("allows the same party/day combination once the first row is archived (not just an unrelated second row)", async () => {
    const user = await createTestUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const incomeDate = new Date("2026-08-21");

    const first = await prisma.partyIncome.create({
      data: dailyRow({ partyId: party.id, userId: user.id, incomeDate, amount: "1000" }),
    });
    await prisma.partyIncome.update({
      where: { id: first.id },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });

    await expect(
      prisma.partyIncome.create({
        data: dailyRow({ partyId: party.id, userId: user.id, incomeDate, amount: "1500" }),
      }),
    ).resolves.toBeTruthy();
  });
});
