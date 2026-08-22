import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";

/**
 * CLAUDE.md Phase 6 mandatory decision #5: a documented retention policy
 * and a safe cleanup mechanism, never a blind TTL that could remove a
 * receipt while a client's retry might still legitimately occur.
 *
 * The danger window this policy protects against is not "how long the
 * server takes to respond" (that is one HTTP round trip) — it is "how
 * long a device might stay offline or otherwise fail to receive its own
 * upload's response after the server already committed it." A device can
 * legitimately stay offline for a long time (this system's whole premise,
 * FR-OFF), so the retention window is set generously long (180 days —
 * roughly double the 90-day `recentRecords` cache window, FR-OFF-14) so
 * that no realistic length of offline time causes a receipt to disappear
 * before the retrying device reconnects. Cleanup only ever removes rows
 * strictly older than this cutoff — never anything newer, regardless of
 * status — and is a separate, explicit, Admin-only maintenance action
 * (`sync:retention-cleanup`), not something any ordinary request triggers
 * automatically. Per CON-07 (single-developer maintainability), this is a
 * plain callable function meant to be invoked periodically (e.g. monthly)
 * once this project adopts a scheduler — it deliberately does not wire
 * itself into a cron job, since none exists yet in this deployment.
 */
export const RECEIPT_RETENTION_DAYS = 180;

export interface RetentionCleanupResult {
  deletedCount: number;
  cutoff: string;
}

export async function cleanupExpiredSyncReceipts(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
): Promise<RetentionCleanupResult> {
  requirePermission(currentUser, "sync:retention-cleanup");

  const cutoff = new Date(Date.now() - RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.syncOperation.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deletedCount: result.count, cutoff: cutoff.toISOString() };
}
