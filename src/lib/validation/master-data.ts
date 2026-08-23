import { z } from "zod";

/**
 * Phase 7 master data (parties, expense items, expense categories,
 * vendors) — FR-MST-01 to 05. Every schema trims the name before any
 * further check, matching what the database's own functional unique index
 * enforces (`lower(btrim(name))`, phase7_administration_and_import
 * migration) — trimming here is what actually gets *saved*, not just what
 * gets compared for uniqueness.
 */

const partyName = z.string().trim().min(1, "Name is required.").max(150);
const shortName = z.string().trim().min(1, "Name is required.").max(120);

export const createPartySchema = z.object({
  name: partyName,
  billingMode: z.enum(["DAILY", "MONTHLY"]),
  sortOrder: z.number().int().min(0).max(32767),
});

/** `billingMode` is deliberately absent — FR-MST-01 says "add, rename, archive," never "change billing mode"; it is immutable after creation because existing income entries are recorded against it. */
export const updatePartySchema = z.object({
  id: z.string().uuid(),
  name: partyName,
  sortOrder: z.number().int().min(0).max(32767),
  expectedUpdatedAt: z.string().nullable(),
});

export const archiveOrReactivatePartySchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
  expectedUpdatedAt: z.string().nullable(),
});

export const createExpenseItemSchema = z.object({ name: shortName });

export const updateExpenseItemSchema = z.object({
  id: z.string().uuid(),
  name: shortName,
  expectedUpdatedAt: z.string().nullable(),
});

export const archiveOrReactivateExpenseItemSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
  expectedUpdatedAt: z.string().nullable(),
});

export const createExpenseCategorySchema = z.object({
  name: shortName,
  expenseGroup: z.enum(["ADMIN", "PURCHASING"]),
  isRecurring: z.boolean(),
});

/** `expenseGroup` is immutable after creation — same reasoning as Party's `billingMode` (FR-MST-03's verbs don't include "reclassify," and existing monthly-expense rows are grouped by it in every report). `isRecurring` IS editable — FR-MST-03 explicitly names it. */
export const updateExpenseCategorySchema = z.object({
  id: z.string().uuid(),
  name: shortName,
  isRecurring: z.boolean(),
  expectedUpdatedAt: z.string().nullable(),
});

export const archiveOrReactivateExpenseCategorySchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
  expectedUpdatedAt: z.string().nullable(),
});

export const createVendorSchema = z.object({ name: partyName });

export const updateVendorSchema = z.object({
  id: z.string().uuid(),
  name: partyName,
  expectedUpdatedAt: z.string().nullable(),
});

export const archiveOrReactivateVendorSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
  expectedUpdatedAt: z.string().nullable(),
});

/** Case/whitespace-insensitive equality — the same normalization the database's own functional index applies, used for the friendly pre-check before the index's own P2002 becomes the final authority. */
export function namesMatchNormalized(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
