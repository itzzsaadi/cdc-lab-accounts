"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import {
  createCapitalContribution,
  archiveCapitalContribution,
  type CreateResult,
  type MutationResult,
} from "../mutations/capital-contributions";

export type { CreateResult, MutationResult };

export async function createCapitalContributionAction(input: unknown): Promise<CreateResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return createCapitalContribution(prisma, currentUser, input);
}

export async function archiveCapitalContributionAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return archiveCapitalContribution(prisma, currentUser, input);
}
