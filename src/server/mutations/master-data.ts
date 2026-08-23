import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import {
  createPartySchema,
  updatePartySchema,
  archiveOrReactivatePartySchema,
  createExpenseItemSchema,
  updateExpenseItemSchema,
  archiveOrReactivateExpenseItemSchema,
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  archiveOrReactivateExpenseCategorySchema,
  createVendorSchema,
  updateVendorSchema,
  archiveOrReactivateVendorSchema,
} from "../../lib/validation/master-data";

export type MutationResult = { ok: true; id?: string } | { ok: false; error: string };

const DUPLICATE_NAME_ERROR =
  "A record with this name already exists (case and whitespace don't count).";
const STALE_WRITE_ERROR = "This record was changed elsewhere. Reload it and try again.";

/**
 * FR-MST-01 to 05. Shared engine behind every master-data entity's
 * create/rename/archive/reactivate action — parameterized by the Prisma
 * delegate so the same case-insensitive-duplicate pre-check, stale-write
 * compare-and-swap, and audit-write discipline isn't hand-repeated four
 * times with a chance for one copy to drift. The *public* functions below
 * are still one per entity (never a single generic "master data" action a
 * caller could point at an arbitrary table) — this is composition, not a
 * generic CRUD framework.
 *
 * Case-insensitive duplicate handling: a friendly pre-check here (never
 * the sole guarantee), backed by the database's own functional unique
 * index on `lower(btrim(name))` (phase7_administration_and_import
 * migration) as the final authority — this function still lets a P2002
 * from that index propagate as a generic error if two requests race past
 * the pre-check, which is an acceptable, rare edge case for master-data
 * volume (never a silent duplicate).
 */
async function findByNormalizedName<T extends { name: string }>(
  findMany: () => Promise<T[]>,
  name: string,
): Promise<T | undefined> {
  const normalized = name.trim().toLowerCase();
  const all = await findMany();
  return all.find((row) => row.name.trim().toLowerCase() === normalized);
}

// ---------------------------------------------------------------------------
// Parties (FR-MST-01) — billingMode is immutable after creation, see
// lib/validation/master-data.ts's own comment.
// ---------------------------------------------------------------------------

export async function createParty(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = createPartySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const existing = await findByNormalizedName(() => prisma.party.findMany(), data.name);
  if (existing) return { ok: false, error: DUPLICATE_NAME_ERROR };

  const id = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.party.create({
        data: {
          id,
          name: data.name,
          billingMode: data.billingMode,
          sortOrder: data.sortOrder,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "party",
        entityId: id,
        newValues: { name: data.name, billingMode: data.billingMode },
      });
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: DUPLICATE_NAME_ERROR };
  }
}

export async function updateParty(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = updatePartySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const dup = await findByNormalizedName(() => prisma.party.findMany(), data.name);
  if (dup && dup.id !== data.id) return { ok: false, error: DUPLICATE_NAME_ERROR };

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.party.findUnique({ where: { id: data.id } });
      const result = await tx.party.updateMany({
        where: {
          id: data.id,
          updatedAt: data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null,
        },
        data: {
          name: data.name,
          sortOrder: data.sortOrder,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });
      if (result.count !== 1) return { ok: false, error: STALE_WRITE_ERROR };
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "UPDATE",
        entityType: "party",
        entityId: data.id,
        oldValues: before ? { name: before.name, sortOrder: before.sortOrder } : undefined,
        newValues: { name: data.name, sortOrder: data.sortOrder },
      });
      return { ok: true };
    });
  } catch {
    return { ok: false, error: DUPLICATE_NAME_ERROR };
  }
}

export async function archiveOrReactivateParty(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = archiveOrReactivatePartySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.party.updateMany({
      where: {
        id: data.id,
        updatedAt: data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null,
      },
      data: { isActive: data.isActive, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) return { ok: false, error: STALE_WRITE_ERROR };
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: data.isActive ? "UPDATE" : "ARCHIVE",
      entityType: "party",
      entityId: data.id,
      newValues: { is_active: data.isActive },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Expense items (FR-MST-02)
// ---------------------------------------------------------------------------

export async function createExpenseItem(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = createExpenseItemSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const existing = await findByNormalizedName(() => prisma.expenseItem.findMany(), data.name);
  if (existing) return { ok: false, error: DUPLICATE_NAME_ERROR };

  const id = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.expenseItem.create({
        data: { id, name: data.name, updatedBy: user.id, updatedAt: new Date() },
      });
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "expense_item",
        entityId: id,
        newValues: { name: data.name },
      });
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: DUPLICATE_NAME_ERROR };
  }
}

export async function updateExpenseItem(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = updateExpenseItemSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const dup = await findByNormalizedName(() => prisma.expenseItem.findMany(), data.name);
  if (dup && dup.id !== data.id) return { ok: false, error: DUPLICATE_NAME_ERROR };

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.expenseItem.findUnique({ where: { id: data.id } });
      const result = await tx.expenseItem.updateMany({
        where: {
          id: data.id,
          updatedAt: data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null,
        },
        data: { name: data.name, updatedBy: user.id, updatedAt: new Date() },
      });
      if (result.count !== 1) return { ok: false, error: STALE_WRITE_ERROR };
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "UPDATE",
        entityType: "expense_item",
        entityId: data.id,
        oldValues: before ? { name: before.name } : undefined,
        newValues: { name: data.name },
      });
      return { ok: true };
    });
  } catch {
    return { ok: false, error: DUPLICATE_NAME_ERROR };
  }
}

export async function archiveOrReactivateExpenseItem(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = archiveOrReactivateExpenseItemSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.expenseItem.updateMany({
      where: {
        id: data.id,
        updatedAt: data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null,
      },
      data: { isActive: data.isActive, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) return { ok: false, error: STALE_WRITE_ERROR };
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: data.isActive ? "UPDATE" : "ARCHIVE",
      entityType: "expense_item",
      entityId: data.id,
      newValues: { is_active: data.isActive },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Expense categories (FR-MST-03) — expenseGroup is immutable after
// creation; isRecurring is editable (FR-MST-03 explicitly names it).
// ---------------------------------------------------------------------------

export async function createExpenseCategory(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = createExpenseCategorySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const existing = await findByNormalizedName(() => prisma.expenseCategory.findMany(), data.name);
  if (existing) return { ok: false, error: DUPLICATE_NAME_ERROR };

  const id = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.expenseCategory.create({
        data: {
          id,
          name: data.name,
          expenseGroup: data.expenseGroup,
          isRecurring: data.isRecurring,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "expense_category",
        entityId: id,
        newValues: {
          name: data.name,
          expenseGroup: data.expenseGroup,
          isRecurring: data.isRecurring,
        },
      });
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: DUPLICATE_NAME_ERROR };
  }
}

export async function updateExpenseCategory(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = updateExpenseCategorySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const dup = await findByNormalizedName(() => prisma.expenseCategory.findMany(), data.name);
  if (dup && dup.id !== data.id) return { ok: false, error: DUPLICATE_NAME_ERROR };

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.expenseCategory.findUnique({ where: { id: data.id } });
      const result = await tx.expenseCategory.updateMany({
        where: {
          id: data.id,
          updatedAt: data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null,
        },
        data: {
          name: data.name,
          isRecurring: data.isRecurring,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });
      if (result.count !== 1) return { ok: false, error: STALE_WRITE_ERROR };
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "UPDATE",
        entityType: "expense_category",
        entityId: data.id,
        oldValues: before ? { name: before.name, isRecurring: before.isRecurring } : undefined,
        newValues: { name: data.name, isRecurring: data.isRecurring },
      });
      return { ok: true };
    });
  } catch {
    return { ok: false, error: DUPLICATE_NAME_ERROR };
  }
}

export async function archiveOrReactivateExpenseCategory(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = archiveOrReactivateExpenseCategorySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.expenseCategory.updateMany({
      where: {
        id: data.id,
        updatedAt: data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null,
      },
      data: { isActive: data.isActive, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) return { ok: false, error: STALE_WRITE_ERROR };
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: data.isActive ? "UPDATE" : "ARCHIVE",
      entityType: "expense_category",
      entityId: data.id,
      newValues: { is_active: data.isActive },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Vendors (FR-MST-04)
// ---------------------------------------------------------------------------

export async function createVendor(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = createVendorSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const existing = await findByNormalizedName(() => prisma.vendor.findMany(), data.name);
  if (existing) return { ok: false, error: DUPLICATE_NAME_ERROR };

  const id = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.vendor.create({
        data: { id, name: data.name, updatedBy: user.id, updatedAt: new Date() },
      });
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "vendor",
        entityId: id,
        newValues: { name: data.name },
      });
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: DUPLICATE_NAME_ERROR };
  }
}

export async function updateVendor(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = updateVendorSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const dup = await findByNormalizedName(() => prisma.vendor.findMany(), data.name);
  if (dup && dup.id !== data.id) return { ok: false, error: DUPLICATE_NAME_ERROR };

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.vendor.findUnique({ where: { id: data.id } });
      const result = await tx.vendor.updateMany({
        where: {
          id: data.id,
          updatedAt: data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null,
        },
        data: { name: data.name, updatedBy: user.id, updatedAt: new Date() },
      });
      if (result.count !== 1) return { ok: false, error: STALE_WRITE_ERROR };
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "UPDATE",
        entityType: "vendor",
        entityId: data.id,
        oldValues: before ? { name: before.name } : undefined,
        newValues: { name: data.name },
      });
      return { ok: true };
    });
  } catch {
    return { ok: false, error: DUPLICATE_NAME_ERROR };
  }
}

export async function archiveOrReactivateVendor(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "master-data:manage");
  const parsed = archiveOrReactivateVendorSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.vendor.updateMany({
      where: {
        id: data.id,
        updatedAt: data.expectedUpdatedAt ? new Date(data.expectedUpdatedAt) : null,
      },
      data: { isActive: data.isActive, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) return { ok: false, error: STALE_WRITE_ERROR };
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: data.isActive ? "UPDATE" : "ARCHIVE",
      entityType: "vendor",
      entityId: data.id,
      newValues: { is_active: data.isActive },
    });
    return { ok: true };
  });
}
