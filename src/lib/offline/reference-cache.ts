import type { OfflineDatabase } from "./db";
import type {
  ReferenceExpenseCategory,
  ReferenceExpenseItem,
  ReferenceParty,
  ReferencePartnerUser,
  ReferenceVendor,
} from "./types";

interface ReferenceSnapshot {
  parties: ReferenceParty[];
  partnerUsers: ReferencePartnerUser[];
  expenseItems: ReferenceExpenseItem[];
  expenseCategories: ReferenceExpenseCategory[];
  vendors: ReferenceVendor[];
}

/**
 * Refreshes every reference-data table from `/api/sync/reference` — called
 * on sign-in and after every successful sync (FR-OFF). Each table is
 * replaced wholesale inside one transaction: a row missing from the fresh
 * snapshot is gone from the cache (it was archived or renamed — the next
 * fetch already reflects that), never merged field-by-field, which keeps
 * this the single, simple source of truth for what is currently pickable
 * offline. Never removes `recentRecords` or queued `operations` — those
 * are separate tables with their own lifecycle.
 *
 * Returns `false` (without throwing) on any network/HTTP failure, so a
 * caller attempting this opportunistically while possibly offline can
 * simply skip it rather than surface an error — the existing cached
 * reference data (however stale) remains in place either way.
 */
export async function refreshReferenceCache(db: OfflineDatabase): Promise<boolean> {
  let snapshot: ReferenceSnapshot;
  try {
    const response = await fetch("/api/sync/reference", { method: "GET" });
    if (!response.ok) {
      return false;
    }
    snapshot = await response.json();
  } catch {
    return false;
  }

  await db.transaction(
    "rw",
    [db.parties, db.partnerUsers, db.expenseItems, db.expenseCategories, db.vendors],
    async () => {
      await Promise.all([
        db.parties.clear(),
        db.partnerUsers.clear(),
        db.expenseItems.clear(),
        db.expenseCategories.clear(),
        db.vendors.clear(),
      ]);
      await Promise.all([
        db.parties.bulkAdd(snapshot.parties),
        db.partnerUsers.bulkAdd(snapshot.partnerUsers),
        db.expenseItems.bulkAdd(snapshot.expenseItems),
        db.expenseCategories.bulkAdd(snapshot.expenseCategories),
        db.vendors.bulkAdd(snapshot.vendors),
      ]);
    },
  );
  return true;
}

/** FR-OFF-14: prune recentRecords older than 90 days — called alongside a
 * reference-cache refresh, never on every render. */
const RECENT_RECORDS_RETENTION_DAYS = 90;

export async function pruneRecentRecords(db: OfflineDatabase): Promise<void> {
  const cutoff = Date.now() - RECENT_RECORDS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  await db.recentRecords.where("syncedAt").below(cutoff).delete();
}
