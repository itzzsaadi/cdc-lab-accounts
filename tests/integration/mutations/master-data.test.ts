import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import { PermissionDeniedError, type AuthenticatedUser } from "../../../src/lib/permissions/guard";
import {
  createParty,
  updateParty,
  archiveOrReactivateParty,
  createExpenseItem,
  createExpenseCategory,
  createVendor,
} from "../../../src/server/mutations/master-data";

const prisma = getTestPrismaClient();

function asUser(user: {
  id: string;
  role: "OPERATOR" | "PARTNER" | "ADMIN";
  isPartner: boolean;
}): AuthenticatedUser {
  return { id: user.id, role: user.role, isPartner: user.isPartner, isActive: true };
}

describe("master-data mutations (FR-MST-01 to 05, Admin-only)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("denies createParty to a Partner (Admin-only)", async () => {
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });
    await expect(
      createParty(prisma, asUser(partner), {
        name: "Test Lab",
        billingMode: "DAILY",
        sortOrder: 1,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("creates a party, rejects a case-insensitive duplicate name, and writes an audit row", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const result = await createParty(prisma, asUser(admin), {
      name: "  Test Lab A  ",
      billingMode: "DAILY",
      sortOrder: 1,
    });
    expect(result.ok).toBe(true);
    const saved = await prisma.party.findUnique({ where: { id: (result as { id: string }).id } });
    expect(saved!.name).toBe("Test Lab A"); // trimmed before saving

    const dup = await createParty(prisma, asUser(admin), {
      name: "test lab a",
      billingMode: "MONTHLY",
      sortOrder: 2,
    });
    expect(dup.ok).toBe(false);

    const auditRows = await prisma.auditLog.findMany({
      where: { entityType: "party", action: "CREATE" },
    });
    expect(auditRows).toHaveLength(1);
  });

  it("rejects an update whose expectedUpdatedAt is stale (compare-and-swap)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const created = await createParty(prisma, asUser(admin), {
      name: "Stale Test Party",
      billingMode: "DAILY",
      sortOrder: 1,
    });
    const id = (created as { id: string }).id;
    const party = await prisma.party.findUniqueOrThrow({ where: { id } });

    // A concurrent edit happens first.
    await prisma.party.update({ where: { id }, data: { sortOrder: 5, updatedAt: new Date() } });

    const staleResult = await updateParty(prisma, asUser(admin), {
      id,
      name: "Renamed",
      sortOrder: 9,
      expectedUpdatedAt: party.updatedAt!.toISOString(),
    });
    expect(staleResult.ok).toBe(false);
  });

  it("archives and reactivates a party, writing ARCHIVE then UPDATE audit actions", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const created = await createParty(prisma, asUser(admin), {
      name: "Archivable Party",
      billingMode: "DAILY",
      sortOrder: 1,
    });
    const id = (created as { id: string }).id;
    let party = await prisma.party.findUniqueOrThrow({ where: { id } });

    const archived = await archiveOrReactivateParty(prisma, asUser(admin), {
      id,
      isActive: false,
      expectedUpdatedAt: party.updatedAt!.toISOString(),
    });
    expect(archived.ok).toBe(true);
    party = await prisma.party.findUniqueOrThrow({ where: { id } });
    expect(party.isActive).toBe(false);

    const reactivated = await archiveOrReactivateParty(prisma, asUser(admin), {
      id,
      isActive: true,
      expectedUpdatedAt: party.updatedAt!.toISOString(),
    });
    expect(reactivated.ok).toBe(true);

    const actions = await prisma.auditLog.findMany({
      where: { entityType: "party", entityId: id },
      orderBy: { capturedAt: "asc" },
    });
    expect(actions.map((a) => a.action)).toEqual(["CREATE", "ARCHIVE", "UPDATE"]);
  });

  it("creates an expense item, expense category, and vendor as Admin", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    expect((await createExpenseItem(prisma, asUser(admin), { name: "Reagent X" })).ok).toBe(true);
    expect(
      (
        await createExpenseCategory(prisma, asUser(admin), {
          name: "Utilities",
          expenseGroup: "ADMIN",
          isRecurring: true,
        })
      ).ok,
    ).toBe(true);
    expect((await createVendor(prisma, asUser(admin), { name: "Acme Supplies" })).ok).toBe(true);
  });
});
