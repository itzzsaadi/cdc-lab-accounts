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

/** Phase 3B entry fixtures — never seeded through prisma/seed.ts (which seeds zero transactions), only ever created directly by tests that need a pre-existing row to edit/archive/concurrency-test against. */
export async function createTestDailyExpense(overrides: {
  userId: string;
  expenseItemId?: string;
  expenseDate?: Date;
  amount?: string;
  fundingSource?: "BUSINESS" | "PARTNER";
  fundedByUserId?: string;
}) {
  const prisma = getTestPrismaClient();
  return prisma.dailyExpense.create({
    data: {
      clientUuid: randomUUID(),
      expenseDate: overrides.expenseDate ?? new Date("2026-08-21"),
      expenseItemId: overrides.expenseItemId,
      customDescription: overrides.expenseItemId ? undefined : "Test expense",
      amount: overrides.amount ?? "500",
      fundingSource: overrides.fundingSource ?? "BUSINESS",
      fundedByUserId: overrides.fundedByUserId,
      capturedAt: new Date(),
      createdBy: overrides.userId,
      updatedBy: overrides.userId,
      updatedAt: new Date(),
    },
  });
}

export async function createTestPartyIncome(overrides: {
  userId: string;
  partyId: string;
  incomeDate?: Date;
  amount?: string;
  receiptType?: "DAILY" | "MONTHLY" | "CASH_DIRECT";
  note?: string;
}) {
  const prisma = getTestPrismaClient();
  return prisma.partyIncome.create({
    data: {
      clientUuid: randomUUID(),
      partyId: overrides.partyId,
      incomeDate: overrides.incomeDate ?? new Date("2026-08-21"),
      amount: overrides.amount ?? "1000",
      receiptType: overrides.receiptType ?? "DAILY",
      note: overrides.note,
      capturedAt: new Date(),
      createdBy: overrides.userId,
      updatedBy: overrides.userId,
      updatedAt: new Date(),
    },
  });
}

/** Phase 4 fixtures — never seeded (Phase 1 seeds an empty asset register, FR-AST-01). */
export async function createTestInstalmentAsset(overrides: {
  userId: string;
  defaultCategoryId: string;
  monthlyInstalment?: string;
  status?: "ACTIVE" | "ARCHIVED";
}) {
  const prisma = getTestPrismaClient();
  return prisma.asset.create({
    data: {
      name: `Test Instalment Asset ${randomUUID()}`,
      classification: "FIXED",
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: overrides.monthlyInstalment ?? "50000",
      defaultCategoryId: overrides.defaultCategoryId,
      status: overrides.status ?? "ACTIVE",
      createdBy: overrides.userId,
      updatedBy: overrides.userId,
      updatedAt: new Date(),
    },
  });
}

export async function createTestCashAsset(overrides: {
  userId: string;
  purchasedByUserId: string;
  purchasePrice?: string;
}) {
  const prisma = getTestPrismaClient();
  return prisma.asset.create({
    data: {
      name: `Test Cash Asset ${randomUUID()}`,
      classification: "MOVABLE",
      acquisitionMode: "CASH",
      purchasePrice: overrides.purchasePrice ?? "150000",
      purchasedByUserId: overrides.purchasedByUserId,
      createdBy: overrides.userId,
      updatedBy: overrides.userId,
      updatedAt: new Date(),
    },
  });
}

export async function createTestCounterIncome(overrides: {
  userId: string;
  incomeDate?: Date;
  amount?: string;
  note?: string;
}) {
  const prisma = getTestPrismaClient();
  return prisma.counterIncome.create({
    data: {
      clientUuid: randomUUID(),
      incomeDate: overrides.incomeDate ?? new Date("2026-08-21"),
      amount: overrides.amount ?? "2000",
      note: overrides.note,
      capturedAt: new Date(),
      createdBy: overrides.userId,
      updatedBy: overrides.userId,
      updatedAt: new Date(),
    },
  });
}
