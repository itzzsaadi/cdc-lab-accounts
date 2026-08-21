"use server";

import { headers as nextHeaders } from "next/headers";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import { PermissionDeniedError } from "../../lib/permissions/guard";
import { getEntityHistory, type AuditLogEntry } from "../queries/audit-log";

export type EntityHistoryResult =
  { ok: true; items: AuditLogEntry[] } | { ok: false; error: string };

/** FR-AUD-05, called from every entity's own "History" action button (client components can't perform the page-level redirect a denied Server Component uses, so this returns a typed result instead — the underlying `requirePermission` check is still the real enforcement, CLAUDE.md §15/§16). */
export async function getEntityHistoryAction(
  entityType: string,
  entityId: string,
): Promise<EntityHistoryResult> {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  try {
    const items = await getEntityHistory(prisma, currentUser, entityType, entityId);
    return { ok: true, items };
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { ok: false, error: "Not authorized to view history." };
    }
    throw error;
  }
}
