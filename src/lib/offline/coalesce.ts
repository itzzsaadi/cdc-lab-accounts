import { computeRequestFingerprint } from "./fingerprint";
import type { NewOperationInput, QueuedOperation } from "./types";

/**
 * The five deterministic client-side coalescing rules (approved Phase 6
 * plan), applied only while a queued operation is still offline and has
 * never reached the wire. `pending` must be the single non-SYNCING queued
 * operation already on file for the same `[entityType, clientUuid]` — an
 * operation with status `"SYNCING"` is never passed here; a later edit
 * against one queues as a new, separate operation instead (rule 5, applied
 * by the caller, not this function).
 *
 * Returns:
 * - `"discard"` — both the pending and incoming operations are dropped
 *   (rule 2: a record created and archived entirely offline never needs to
 *   reach the server at all).
 * - a merged `QueuedOperation` — replaces `pending` in place (same
 *   `operationId`, since it was never sent and the row is simply updated).
 * - `null` — no rule applies to this `(pending.action, incoming.action)`
 *   pair; the caller should queue `incoming` as a new, separate operation
 *   rather than guess at a merge.
 */
export async function coalesceOperation(
  pending: QueuedOperation,
  incoming: NewOperationInput,
): Promise<QueuedOperation | "discard" | null> {
  // Rule 1: CREATE + later UPDATE(s) -> one CREATE with the latest values,
  // but the original capture time is preserved -- coalescing a later edit
  // must never overwrite when the record was first captured.
  if (pending.action === "CREATE" && incoming.action === "UPDATE") {
    const originalCapturedAt = pending.payload["capturedAt"];
    const mergedPayload: Record<string, unknown> = {
      ...incoming.payload,
      clientUuid: pending.clientUuid,
    };
    if (originalCapturedAt !== undefined) {
      mergedPayload["capturedAt"] = originalCapturedAt;
    }
    return mergedOperation(pending, "CREATE", mergedPayload);
  }

  // Rule 2: CREATE + later ARCHIVE -> discard both, never sent.
  if (pending.action === "CREATE" && incoming.action === "ARCHIVE") {
    return "discard";
  }

  // Rule 3: UPDATE + later UPDATE -> one UPDATE, keeping the *original*
  // expectedUpdatedAt (the base version the first queued edit was made
  // against) so the server's stale-write check still runs against the
  // record's true last-known-synced version.
  if (pending.action === "UPDATE" && incoming.action === "UPDATE") {
    const mergedPayload: Record<string, unknown> = {
      ...incoming.payload,
      id: pending.payload["id"],
      expectedUpdatedAt: pending.payload["expectedUpdatedAt"],
    };
    return mergedOperation(pending, "UPDATE", mergedPayload);
  }

  // Rule 4: UPDATE + later ARCHIVE -> collapses to ARCHIVE alone, keeping
  // the original expectedUpdatedAt.
  if (pending.action === "UPDATE" && incoming.action === "ARCHIVE") {
    const mergedPayload: Record<string, unknown> = {
      id: pending.payload["id"],
      expectedUpdatedAt: pending.payload["expectedUpdatedAt"],
    };
    return mergedOperation(pending, "ARCHIVE", mergedPayload);
  }

  // No defined rule for this pair (e.g. two CREATEs, or anything following
  // an already-pending ARCHIVE) -- never guess; queue separately.
  return null;
}

async function mergedOperation(
  pending: QueuedOperation,
  action: QueuedOperation["action"],
  payload: Record<string, unknown>,
): Promise<QueuedOperation> {
  const requestFingerprint = await computeRequestFingerprint({
    entityType: pending.entityType,
    action,
    clientUuid: pending.clientUuid,
    payload,
  });
  return {
    ...pending,
    action,
    payload,
    requestFingerprint,
    // A merge is a fresh logical submission from the queue's point of view
    // -- reset retry state so it is retried promptly rather than waiting
    // out whatever backoff the pre-merge operation had accrued.
    status: "QUEUED",
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: undefined,
    conflict: undefined,
  };
}
