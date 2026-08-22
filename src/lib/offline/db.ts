import Dexie, { type EntityTable } from "dexie";
import type {
  QueuedOperation,
  ReferenceExpenseCategory,
  ReferenceExpenseItem,
  ReferenceParty,
  ReferencePartnerUser,
  ReferenceVendor,
  RecentRecord,
} from "./types";

/**
 * One IndexedDB database per signed-in user (CLAUDE.md Phase 6: per-user
 * isolation). The database name embeds the user id, so a different user
 * signing in on the same device opens a completely separate database and
 * can never see or upload the prior user's queue or cache — there is no
 * shared table any user's code could accidentally read across accounts.
 */
export class OfflineDatabase extends Dexie {
  operations!: EntityTable<QueuedOperation, "operationId">;
  parties!: EntityTable<ReferenceParty, "id">;
  partnerUsers!: EntityTable<ReferencePartnerUser, "id">;
  expenseItems!: EntityTable<ReferenceExpenseItem, "id">;
  expenseCategories!: EntityTable<ReferenceExpenseCategory, "id">;
  vendors!: EntityTable<ReferenceVendor, "id">;
  recentRecords!: EntityTable<RecentRecord, "id">;

  constructor(userId: string) {
    super(`cdc-offline-${userId}`);
    this.version(1).stores({
      operations: "operationId, [entityType+clientUuid], status, createdAt",
      parties: "id, isActive",
      partnerUsers: "id",
      expenseItems: "id, isActive",
      expenseCategories: "id, isActive",
      vendors: "id, isActive",
      recentRecords: "id, entityType, syncedAt",
    });
  }
}

let cachedDb: OfflineDatabase | null = null;
let cachedUserId: string | null = null;

/**
 * Returns the current user's offline database, opening a fresh one (and
 * closing any previous user's) whenever the signed-in user id changes.
 * Every offline module accesses IndexedDB exclusively through this
 * function — nothing constructs `OfflineDatabase` directly, so isolation
 * cannot be bypassed by forgetting to scope a query.
 */
export function getOfflineDb(userId: string): OfflineDatabase {
  if (cachedDb && cachedUserId === userId) {
    return cachedDb;
  }
  if (cachedDb && cachedUserId !== userId) {
    cachedDb.close();
  }
  cachedDb = new OfflineDatabase(userId);
  cachedUserId = userId;
  return cachedDb;
}

/** Called on sign-out: closes and forgets the cached handle so a
 * subsequent sign-in (by the same or a different user) always opens a
 * fresh connection rather than reusing a stale one. Does not delete the
 * database itself — deletion is a separate, explicit, user-confirmed
 * action (see sign-out warning in components/offline/SignOutGuard.tsx). */
export function closeOfflineDb(): void {
  cachedDb?.close();
  cachedDb = null;
  cachedUserId = null;
}
