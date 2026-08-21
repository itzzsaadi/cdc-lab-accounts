"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import { requirePermission } from "../../lib/permissions/guard";
import {
  createMonthlyExpense,
  updateMonthlyExpense,
  archiveMonthlyExpense,
  generateInstalmentLines,
  applyRecurringPrefill,
  type CreateResult,
  type MutationResult,
  type BatchResult,
} from "../mutations/monthly-expenses";
import {
  listInstalmentGenerationCandidates,
  listRecurringPrefillCandidates,
} from "../queries/monthly-expenses";
import { yearMonthSchema } from "../../lib/validation/calendar-date";

export type { CreateResult, MutationResult, BatchResult };

/** Thin request-bound wrappers — all real logic lives in `../mutations/monthly-expenses.ts` (framework-independent, directly unit/integration-tested). `currentUser` is always resolved from real request headers here, never accepted as a parameter. */

export async function createMonthlyExpenseAction(input: unknown): Promise<CreateResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return createMonthlyExpense(prisma, currentUser, input);
}

export async function updateMonthlyExpenseAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return updateMonthlyExpense(prisma, currentUser, input);
}

export async function archiveMonthlyExpenseAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return archiveMonthlyExpense(prisma, currentUser, input);
}

export async function generateInstalmentLinesAction(input: unknown): Promise<BatchResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return generateInstalmentLines(prisma, currentUser, input);
}

export async function applyRecurringPrefillAction(input: unknown): Promise<BatchResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return applyRecurringPrefill(prisma, currentUser, input);
}

export async function previewInstalmentLinesAction(periodMonth: string) {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  requirePermission(currentUser, "monthly-expense:manage");
  const parsed = yearMonthSchema.safeParse(periodMonth);
  if (!parsed.success) {
    return [];
  }
  return listInstalmentGenerationCandidates(prisma, parsed.data);
}

export async function previewRecurringPrefillAction(periodMonth: string) {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  requirePermission(currentUser, "monthly-expense:manage");
  const parsed = yearMonthSchema.safeParse(periodMonth);
  if (!parsed.success) {
    return [];
  }
  return listRecurringPrefillCandidates(prisma, parsed.data);
}
