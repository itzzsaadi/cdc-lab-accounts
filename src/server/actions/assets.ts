"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import {
  createAsset,
  updateAsset,
  archiveAsset,
  type CreateResult,
  type MutationResult,
} from "../mutations/assets";

export type { CreateResult, MutationResult };

export async function createAssetAction(input: unknown): Promise<CreateResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return createAsset(prisma, currentUser, input);
}

export async function updateAssetAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return updateAsset(prisma, currentUser, input);
}

export async function archiveAssetAction(input: unknown): Promise<MutationResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return archiveAsset(prisma, currentUser, input);
}
