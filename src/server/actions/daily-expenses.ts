"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import {
  createDailyExpense,
  updateDailyExpense,
  archiveDailyExpense,
  type CreateResult,
  type MutationResult,
} from "../mutations/daily-expenses";

export type { CreateResult, MutationResult };

/** Thin request-bound wrappers — all real logic lives in `../mutations/daily-expenses.ts` (framework-independent, directly unit/integration-tested). `currentUser` is always resolved from real request headers here, never accepted as a parameter — a Server Action can never be handed a client-asserted role. */

export async function createDailyExpenseAction(input: unknown): Promise<CreateResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return createDailyExpense(prisma, currentUser, input);
}

export async function updateDailyExpenseAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return updateDailyExpense(prisma, currentUser, input);
}

export async function archiveDailyExpenseAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return archiveDailyExpense(prisma, currentUser, input);
}
