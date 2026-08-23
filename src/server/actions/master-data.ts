"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import * as mutations from "../mutations/master-data";

export type { MutationResult } from "../mutations/master-data";

async function currentUser() {
  return getAuthenticatedUser(await nextHeaders());
}

export async function createPartyAction(input: unknown) {
  return mutations.createParty(prisma, await currentUser(), input);
}
export async function updatePartyAction(input: unknown) {
  return mutations.updateParty(prisma, await currentUser(), input);
}
export async function archiveOrReactivatePartyAction(input: unknown) {
  return mutations.archiveOrReactivateParty(prisma, await currentUser(), input);
}

export async function createExpenseItemAction(input: unknown) {
  return mutations.createExpenseItem(prisma, await currentUser(), input);
}
export async function updateExpenseItemAction(input: unknown) {
  return mutations.updateExpenseItem(prisma, await currentUser(), input);
}
export async function archiveOrReactivateExpenseItemAction(input: unknown) {
  return mutations.archiveOrReactivateExpenseItem(prisma, await currentUser(), input);
}

export async function createExpenseCategoryAction(input: unknown) {
  return mutations.createExpenseCategory(prisma, await currentUser(), input);
}
export async function updateExpenseCategoryAction(input: unknown) {
  return mutations.updateExpenseCategory(prisma, await currentUser(), input);
}
export async function archiveOrReactivateExpenseCategoryAction(input: unknown) {
  return mutations.archiveOrReactivateExpenseCategory(prisma, await currentUser(), input);
}

export async function createVendorAction(input: unknown) {
  return mutations.createVendor(prisma, await currentUser(), input);
}
export async function updateVendorAction(input: unknown) {
  return mutations.updateVendor(prisma, await currentUser(), input);
}
export async function archiveOrReactivateVendorAction(input: unknown) {
  return mutations.archiveOrReactivateVendor(prisma, await currentUser(), input);
}
