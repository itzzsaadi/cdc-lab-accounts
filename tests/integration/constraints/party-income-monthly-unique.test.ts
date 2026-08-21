import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestParty, createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

/** FR-PINC-03, approved decision 2 (Phase 4 migration): party_income_active_monthly_party_month_unique. */
describe("Monthly Party Income uniqueness (party_income_active_monthly_party_month_unique)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a second active MONTHLY row for the same party and month", async () => {
    const user = await createTestUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });
    const incomeDate = new Date("2026-08-01");

    await prisma.partyIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        partyId: party.id,
        incomeDate,
        amount: "50000",
        receiptType: "MONTHLY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    await expect(
      prisma.partyIncome.create({
        data: {
          clientUuid: crypto.randomUUID(),
          partyId: party.id,
          incomeDate,
          amount: "55000",
          receiptType: "MONTHLY",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("allows archive-then-correct for the same party and month", async () => {
    const user = await createTestUser();
    const party = await createTestParty({ billingMode: "MONTHLY" });
    const incomeDate = new Date("2026-08-01");

    const wrong = await prisma.partyIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        partyId: party.id,
        incomeDate,
        amount: "40000",
        receiptType: "MONTHLY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await prisma.partyIncome.update({
      where: { id: wrong.id },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });

    const corrected = await prisma.partyIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        partyId: party.id,
        incomeDate,
        amount: "50000",
        receiptType: "MONTHLY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    expect(corrected.amount.toString()).toBe("50000");
  });

  it("does not restrict DAILY or CASH_DIRECT rows for the same party and date (index scoped to receipt_type = MONTHLY)", async () => {
    const user = await createTestUser();
    const party = await createTestParty({ billingMode: "DAILY" });
    const incomeDate = new Date("2026-08-01");

    await prisma.partyIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        partyId: party.id,
        incomeDate,
        amount: "1000",
        receiptType: "DAILY",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    await expect(
      prisma.partyIncome.create({
        data: {
          clientUuid: crypto.randomUUID(),
          partyId: party.id,
          incomeDate,
          amount: "2000",
          receiptType: "CASH_DIRECT",
          note: "Second same-day receipt",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).resolves.toBeTruthy();
  });
});
