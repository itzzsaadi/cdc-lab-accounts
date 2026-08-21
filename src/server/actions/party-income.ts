"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import {
  createDailyPartyIncomeCell,
  updateDailyPartyIncomeCell,
  archivePartyIncome,
  createCashReceipt,
  createMonthlyPartyBill,
  updateMonthlyPartyBill,
  archiveMonthlyPartyBill,
  type CreateResult,
  type MutationResult,
} from "../mutations/party-income";

export type { CreateResult, MutationResult };

/** Thin request-bound wrappers — all real logic lives in `../mutations/party-income.ts`. */

export async function createDailyPartyIncomeCellAction(input: unknown): Promise<CreateResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return createDailyPartyIncomeCell(prisma, currentUser, input);
}

export async function updateDailyPartyIncomeCellAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return updateDailyPartyIncomeCell(prisma, currentUser, input);
}

export async function archivePartyIncomeAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return archivePartyIncome(prisma, currentUser, input);
}

export async function createCashReceiptAction(input: unknown): Promise<CreateResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return createCashReceipt(prisma, currentUser, input);
}

export async function createMonthlyPartyBillAction(input: unknown): Promise<CreateResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return createMonthlyPartyBill(prisma, currentUser, input);
}

export async function updateMonthlyPartyBillAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return updateMonthlyPartyBill(prisma, currentUser, input);
}

export async function archiveMonthlyPartyBillAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return archiveMonthlyPartyBill(prisma, currentUser, input);
}
