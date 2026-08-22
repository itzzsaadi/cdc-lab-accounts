/** Shared types for the offline queue, reference cache, and sync engine. */

/**
 * Party Income is split into three sync entity types (rather than one
 * generic "party_income") because the three business flows route to
 * different mutation functions and permission checks even though they
 * share one Prisma table — `party_income_cash_receipt` supports CREATE
 * only, since no update/archive mutation for a direct cash receipt exists
 * anywhere in this codebase (see src/server/mutations/party-income.ts).
 */
export type OfflineEntityType =
  | "daily_expense"
  | "monthly_expense"
  | "counter_income"
  | "party_income_daily"
  | "party_income_cash_receipt"
  | "party_income_monthly_bill";

export type QueueAction = "CREATE" | "UPDATE" | "ARCHIVE";

export type QueueOperationStatus = "QUEUED" | "SYNCING" | "SYNCED" | "FAILED" | "CONFLICT";

/** One queued offline mutation. `operationId` (never `clientUuid`) is the
 * Dexie primary key — `clientUuid` identifies the underlying business
 * record, `operationId` identifies this specific queued operation. */
export interface QueuedOperation {
  operationId: string;
  entityType: OfflineEntityType;
  clientUuid: string;
  action: QueueAction;
  /** The exact create/update/archive input the corresponding Zod schema
   * and mutation function expect (validated again, server-side, on
   * upload — this queue never bypasses server validation). */
  payload: Record<string, unknown>;
  /** Computed once at enqueue/coalesce time over
   * `{ entityType, action, clientUuid, payload }` and never recomputed
   * except when the payload itself changes via coalescing. */
  requestFingerprint: string;
  status: QueueOperationStatus;
  /** Automatic-retry attempt counter (capped at 5 — see sync-engine.ts). */
  attempts: number;
  /** Epoch ms; the operation is not retried before this time. */
  nextAttemptAt: number;
  /** Epoch ms; when this operation was first queued (device-local clock) —
   * also used to order pending operations and to break ties when more than
   * one non-SYNCING operation is unexpectedly found for the same record. */
  createdAt: number;
  lastError?: string;
  /** Populated only when status === "CONFLICT" — the server's current row
   * and version, for the Sync Center's Keep Local / Keep Server prompt. */
  conflict?: {
    current: Record<string, unknown>;
    currentVersion: string;
  };
}

/** The input to `enqueueOperation` — everything except the bookkeeping
 * fields the queue itself owns (status/attempts/nextAttemptAt/createdAt). */
export interface NewOperationInput {
  operationId: string;
  entityType: OfflineEntityType;
  clientUuid: string;
  action: QueueAction;
  payload: Record<string, unknown>;
}

export interface ReferenceParty {
  id: string;
  name: string;
  billingMode: "DAILY" | "MONTHLY";
  isActive: boolean;
  sortOrder: number;
}

export interface ReferencePartnerUser {
  id: string;
  fullName: string;
}

export interface ReferenceExpenseItem {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ReferenceExpenseCategory {
  id: string;
  name: string;
  expenseGroup: "ADMIN" | "PURCHASING";
  isActive: boolean;
}

export interface ReferenceVendor {
  id: string;
  name: string;
  isActive: boolean;
}

/** FR-OFF-14: the last N successfully synced rows per entity, kept for 90
 * days, so a recently-entered figure stays visible/editable offline even
 * after the tab reloads. Never a substitute for a live query when online. */
export interface RecentRecord {
  id: string;
  entityType: OfflineEntityType;
  syncedAt: number;
  data: Record<string, unknown>;
}
