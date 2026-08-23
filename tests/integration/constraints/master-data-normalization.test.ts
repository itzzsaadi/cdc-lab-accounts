import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";

const prisma = getTestPrismaClient();

/**
 * Mandatory correction #4: names are trimmed before saving and uniqueness
 * is enforced at the database level via a functional unique index on
 * `lower(btrim(name))` — proven here directly against Postgres, not
 * inferred from the application-layer pre-check
 * (findByNormalizedName in server/mutations/master-data.ts, which is a
 * friendly UX layer only, never the sole guarantee).
 */
describe("master-data name normalization (functional unique index, phase7_administration_and_import)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a case-insensitive duplicate party name", async () => {
    await prisma.party.create({
      data: { name: "Test Lab A", billingMode: "MONTHLY", sortOrder: 1 },
    });
    await expect(
      prisma.party.create({
        data: { name: "test lab a", billingMode: "MONTHLY", sortOrder: 2 },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("rejects a whitespace-variant duplicate party name", async () => {
    await prisma.party.create({
      data: { name: "Test Lab A", billingMode: "MONTHLY", sortOrder: 1 },
    });
    await expect(
      prisma.party.create({
        data: { name: "  Test Lab A  ", billingMode: "MONTHLY", sortOrder: 2 },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("allows two genuinely different party names", async () => {
    await prisma.party.create({
      data: { name: "Test Lab A", billingMode: "MONTHLY", sortOrder: 1 },
    });
    const created = await prisma.party.create({
      data: { name: "Test Lab B", billingMode: "MONTHLY", sortOrder: 2 },
    });
    expect(created.name).toBe("Test Lab B");
  });

  it("still rejects a normalized duplicate against an archived row (archiving never frees the name, FR-MST-05)", async () => {
    const party = await prisma.party.create({
      data: { name: "Test Lab A", billingMode: "MONTHLY", sortOrder: 1 },
    });
    await prisma.party.update({ where: { id: party.id }, data: { isActive: false } });
    await expect(
      prisma.party.create({
        data: { name: "test lab a", billingMode: "MONTHLY", sortOrder: 2 },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("rejects a case-insensitive duplicate expense item name", async () => {
    await prisma.expenseItem.create({ data: { name: "Reagent X" } });
    await expect(prisma.expenseItem.create({ data: { name: "REAGENT X" } })).rejects.toThrow(
      /Unique constraint/,
    );
  });

  it("rejects a case-insensitive duplicate expense category name", async () => {
    await prisma.expenseCategory.create({ data: { name: "Utilities", expenseGroup: "ADMIN" } });
    await expect(
      prisma.expenseCategory.create({ data: { name: "utilities", expenseGroup: "ADMIN" } }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("rejects a case-insensitive duplicate vendor name", async () => {
    await prisma.vendor.create({ data: { name: "Acme Supplies" } });
    await expect(prisma.vendor.create({ data: { name: "acme supplies" } })).rejects.toThrow(
      /Unique constraint/,
    );
  });
});
