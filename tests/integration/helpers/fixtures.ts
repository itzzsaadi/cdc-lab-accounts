import { randomUUID } from "node:crypto";
import { getTestPrismaClient } from "./test-db";
import type { Role } from "../../../generated/prisma/enums";

/**
 * Throwaway `users` rows for integration/constraint tests only — never
 * seeded through `prisma/seed.ts` (Phase 1 seeds zero users, see
 * docs/adr/0002-phase-1-schema-clarifications.md). Phase 1's `users`
 * table has no `password_hash` column at all, so there is no credential
 * field to fabricate here — these rows are never valid login credentials,
 * only FK/trigger test fixtures.
 */
export async function createTestUser(overrides: { isPartner?: boolean; role?: Role } = {}) {
  const prisma = getTestPrismaClient();
  return prisma.user.create({
    data: {
      fullName: "Test User",
      email: `test-${randomUUID()}@example.test`,
      role: overrides.role ?? "OPERATOR",
      isPartner: overrides.isPartner ?? false,
    },
  });
}

export async function createTestParty(
  overrides: { billingMode?: "DAILY" | "MONTHLY"; sortOrder?: number } = {},
) {
  const prisma = getTestPrismaClient();
  return prisma.party.create({
    data: {
      name: `Test Party ${randomUUID()}`,
      billingMode: overrides.billingMode ?? "MONTHLY",
      sortOrder: overrides.sortOrder ?? 1,
    },
  });
}

export async function createTestExpenseItem() {
  const prisma = getTestPrismaClient();
  return prisma.expenseItem.create({ data: { name: `Test Item ${randomUUID()}` } });
}

export async function createTestExpenseCategory(
  overrides: { expenseGroup?: "ADMIN" | "PURCHASING" } = {},
) {
  const prisma = getTestPrismaClient();
  return prisma.expenseCategory.create({
    data: {
      name: `Test Category ${randomUUID()}`,
      expenseGroup: overrides.expenseGroup ?? "ADMIN",
    },
  });
}

export async function createTestVendor() {
  const prisma = getTestPrismaClient();
  return prisma.vendor.create({ data: { name: `Test Vendor ${randomUUID()}` } });
}
