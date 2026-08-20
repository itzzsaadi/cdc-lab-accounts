import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

describe("partner-eligibility triggers (approved decision — database trigger)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a capital contribution whose partner_user_id is not a partner", async () => {
    const nonPartner = await createTestUser({ isPartner: false });
    await expect(
      prisma.capitalContribution.create({
        data: {
          partnerUserId: nonPartner.id,
          entryDate: new Date("2026-07-01"),
          amount: "1000",
          contributionType: "INJECTION",
          createdBy: nonPartner.id,
          updatedBy: nonPartner.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/is_partner/);
  });

  it("allows a capital contribution whose partner_user_id is a real partner", async () => {
    const partner = await createTestUser({ isPartner: true });
    const created = await prisma.capitalContribution.create({
      data: {
        partnerUserId: partner.id,
        entryDate: new Date("2026-07-01"),
        amount: "1000",
        contributionType: "INJECTION",
        createdBy: partner.id,
        updatedBy: partner.id,
        updatedAt: new Date(),
      },
    });
    expect(created.partnerUserId).toBe(partner.id);
  });

  it("rejects a cash asset whose purchased_by_user_id is not a partner", async () => {
    const nonPartner = await createTestUser({ isPartner: false });
    await expect(
      prisma.asset.create({
        data: {
          name: "Test Analyser",
          classification: "FIXED",
          acquisitionMode: "CASH",
          purchasePrice: "150000",
          purchasedByUserId: nonPartner.id,
          createdBy: nonPartner.id,
          updatedBy: nonPartner.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/is_partner/);
  });

  it("allows a cash asset whose purchased_by_user_id is a real partner", async () => {
    const partner = await createTestUser({ isPartner: true });
    const created = await prisma.asset.create({
      data: {
        name: "Test Analyser",
        classification: "FIXED",
        acquisitionMode: "CASH",
        purchasePrice: "150000",
        purchasedByUserId: partner.id,
        createdBy: partner.id,
        updatedBy: partner.id,
        updatedAt: new Date(),
      },
    });
    expect(created.purchasedByUserId).toBe(partner.id);
  });

  it("rejects a monthly expense funded_by_user_id that is not a partner", async () => {
    const nonPartner = await createTestUser({ isPartner: false });
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${crypto.randomUUID()}`, expenseGroup: "ADMIN" },
    });
    await expect(
      prisma.monthlyExpense.create({
        data: {
          clientUuid: crypto.randomUUID(),
          periodMonth: new Date("2026-07-01"),
          categoryId: category.id,
          amount: "5000",
          fundingSource: "PARTNER",
          fundedByUserId: nonPartner.id,
          capturedAt: new Date(),
          createdBy: nonPartner.id,
          updatedBy: nonPartner.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/is_partner/);
  });
});
