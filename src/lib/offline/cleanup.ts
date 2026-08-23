import { getOfflineDb, deleteOfflineDatabase } from "./db";

/**
 * NFR-SEC-09: "Data held on a device for offline use shall be cleared on
 * sign-out, once no entries are waiting to upload." This is deliberately
 * a sign-out-time action, not something run periodically during an active
 * session — the reference cache and `recentRecords` exist specifically to
 * support FR-OFF-14 ("the most recent 90 days of entries shall be
 * readable offline") *while the user keeps using this device*, so wiping
 * them mid-session would defeat that requirement for no security benefit
 * (nothing sensitive lingers mid-session that isn't already scoped to
 * this signed-in user's own IndexedDB database). The two requirements
 * reconcile cleanly on session boundaries: keep the 90-day cache alive
 * for as long as the session is open, then remove the whole database —
 * cache included — the moment the user actually leaves, but only when
 * there is truly nothing left to protect.
 *
 * Reads the *current* `operations` count directly from IndexedDB rather
 * than trusting a caller-supplied count, so a stale React render can
 * never cause a pending/failed/conflicted operation to be silently
 * deleted alongside the cache — the one thing this function must never
 * do (CLAUDE.md's no-silent-deletion posture, applied here to offline
 * data instead of a financial record).
 */
export async function clearOfflineDataIfQueueEmpty(userId: string): Promise<boolean> {
  const db = getOfflineDb(userId);
  const queuedCount = await db.operations.count();
  if (queuedCount > 0) {
    return false;
  }
  await deleteOfflineDatabase(userId);
  return true;
}
