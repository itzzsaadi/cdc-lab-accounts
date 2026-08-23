"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import {
  configurePartnerMapping,
  updateProfitSplit,
  type MutationResult,
} from "../mutations/app-settings";

export type { MutationResult };

export async function configurePartnerMappingAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return configurePartnerMapping(prisma, currentUser, input);
}

export async function updateProfitSplitAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return updateProfitSplit(prisma, currentUser, input);
}
