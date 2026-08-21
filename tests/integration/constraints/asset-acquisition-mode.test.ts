import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

describe("asset acquisition-mode mutual exclusivity (DR-08, FR-AST-07, BR-09)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects INSTALMENT with no monthly_instalment", async () => {
    const user = await createTestUser();
    await expect(
      prisma.asset.create({
        data: {
          name: "Bad Instalment Asset",
          classification: "FIXED",
          acquisitionMode: "INSTALMENT",
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects INSTALMENT with a purchased_by_user_id set (BR-09 — no partner tag)", async () => {
    const partner = await createTestUser({ isPartner: true });
    await expect(
      prisma.asset.create({
        data: {
          name: "Bad Instalment Asset",
          classification: "FIXED",
          acquisitionMode: "INSTALMENT",
          monthlyInstalment: "50000",
          purchasedByUserId: partner.id,
          createdBy: partner.id,
          updatedBy: partner.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects CASH with no purchase_price or purchased_by_user_id", async () => {
    const user = await createTestUser();
    await expect(
      prisma.asset.create({
        data: {
          name: "Bad Cash Asset",
          classification: "MOVABLE",
          acquisitionMode: "CASH",
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects CASH with a monthly_instalment also set", async () => {
    const partner = await createTestUser({ isPartner: true });
    await expect(
      prisma.asset.create({
        data: {
          name: "Bad Cash Asset",
          classification: "MOVABLE",
          acquisitionMode: "CASH",
          purchasePrice: "150000",
          purchasedByUserId: partner.id,
          monthlyInstalment: "1000",
          createdBy: partner.id,
          updatedBy: partner.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects INSTALMENT with no default_category_id (Phase 4)", async () => {
    const user = await createTestUser();
    await expect(
      prisma.asset.create({
        data: {
          name: "Bad Instalment Asset",
          classification: "FIXED",
          acquisitionMode: "INSTALMENT",
          monthlyInstalment: "50000",
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects CASH with a default_category_id set (Phase 4)", async () => {
    const partner = await createTestUser({ isPartner: true });
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${crypto.randomUUID()}`, expenseGroup: "PURCHASING" },
    });
    await expect(
      prisma.asset.create({
        data: {
          name: "Bad Cash Asset",
          classification: "MOVABLE",
          acquisitionMode: "CASH",
          purchasePrice: "150000",
          purchasedByUserId: partner.id,
          defaultCategoryId: category.id,
          createdBy: partner.id,
          updatedBy: partner.id,
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("allows a valid INSTALMENT asset", async () => {
    const user = await createTestUser();
    const category = await prisma.expenseCategory.create({
      data: { name: `Cat ${crypto.randomUUID()}`, expenseGroup: "PURCHASING" },
    });
    const created = await prisma.asset.create({
      data: {
        name: "Good Instalment Asset",
        classification: "FIXED",
        acquisitionMode: "INSTALMENT",
        monthlyInstalment: "50000",
        defaultCategoryId: category.id,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    expect(created.monthlyInstalment?.toString()).toBe("50000");
  });

  it("allows a valid CASH asset", async () => {
    const partner = await createTestUser({ isPartner: true });
    const created = await prisma.asset.create({
      data: {
        name: "Good Cash Asset",
        classification: "MOVABLE",
        acquisitionMode: "CASH",
        purchasePrice: "150000",
        purchasedByUserId: partner.id,
        createdBy: partner.id,
        updatedBy: partner.id,
        updatedAt: new Date(),
      },
    });
    expect(created.purchasePrice?.toString()).toBe("150000");
  });
});
