import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestExpenseCategory } from "../helpers/fixtures";
import { createAsset, updateAsset, archiveAsset } from "../../../src/server/mutations/assets";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("createAsset (FR-AST-01/02/06/07)", () => {
  it("creates a valid INSTALMENT asset with an active Purchasing default category", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });

    const result = await createAsset(prisma, user, {
      name: "Haematology Analyser",
      classification: "FIXED",
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
      defaultCategoryId: category.id,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an INSTALMENT asset whose default category is not active", async () => {
    const user = await partnerUser();
    const category = await prisma.expenseCategory.create({
      data: {
        name: `Inactive ${crypto.randomUUID()}`,
        expenseGroup: "PURCHASING",
        isActive: false,
      },
    });

    const result = await createAsset(prisma, user, {
      name: "Bad Asset",
      classification: "FIXED",
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
      defaultCategoryId: category.id,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an INSTALMENT asset whose default category is Administration, not Purchasing", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "ADMIN" });

    const result = await createAsset(prisma, user, {
      name: "Bad Asset",
      classification: "FIXED",
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
      defaultCategoryId: category.id,
    });
    expect(result.ok).toBe(false);
  });

  it("creates a valid CASH asset with a purchasing partner and adds it to that partner's investment", async () => {
    const user = await partnerUser();

    const result = await createAsset(prisma, user, {
      name: "Centrifuge",
      classification: "MOVABLE",
      acquisitionMode: "CASH",
      purchasePrice: "150000",
      purchasedByUserId: user.id,
    });
    expect(result.ok).toBe(true);
    const created = await prisma.asset.findFirst({ where: { name: "Centrifuge" } });
    expect(created?.purchasedByUserId).toBe(user.id);
  });
});

describe("updateAsset / archiveAsset (atomic conditional write, no physical deletion)", () => {
  it("rejects a stale update", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });
    const created = await createAsset(prisma, user, {
      name: "Analyser",
      classification: "FIXED",
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
      defaultCategoryId: category.id,
    });
    if (!created.ok) throw new Error("setup failed");
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: created.id } });

    const result = await updateAsset(prisma, user, {
      id: created.id,
      expectedUpdatedAt: new Date(row.updatedAt.getTime() - 1000).toISOString(),
      name: "Analyser (renamed)",
      classification: "FIXED",
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "60000",
      defaultCategoryId: category.id,
    });
    expect(result.ok).toBe(false);
  });

  it("archives (status = ARCHIVED) rather than deleting", async () => {
    const user = await partnerUser();
    const category = await createTestExpenseCategory({ expenseGroup: "PURCHASING" });
    const created = await createAsset(prisma, user, {
      name: "Analyser",
      classification: "FIXED",
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
      defaultCategoryId: category.id,
    });
    if (!created.ok) throw new Error("setup failed");
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: created.id } });

    const result = await archiveAsset(prisma, user, {
      id: created.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(result.ok).toBe(true);

    const archived = await prisma.asset.findUniqueOrThrow({ where: { id: created.id } });
    expect(archived.status).toBe("ARCHIVED");
  });
});
