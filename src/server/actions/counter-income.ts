"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import {
  createCounterIncome,
  updateCounterIncome,
  archiveCounterIncome,
  type CreateResult,
  type MutationResult,
} from "../mutations/counter-income";

export type { CreateResult, MutationResult };

/** Thin request-bound wrappers — all real logic lives in `../mutations/counter-income.ts`. */

export async function createCounterIncomeAction(input: unknown): Promise<CreateResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return createCounterIncome(prisma, currentUser, input);
}

export async function updateCounterIncomeAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return updateCounterIncome(prisma, currentUser, input);
}

export async function archiveCounterIncomeAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return archiveCounterIncome(prisma, currentUser, input);
}
