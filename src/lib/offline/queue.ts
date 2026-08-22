import { coalesceOperation } from "./coalesce";
import { computeRequestFingerprint } from "./fingerprint";
import { computeBackoffDelayMs, MAX_AUTOMATIC_ATTEMPTS } from "./backoff";
import type { OfflineDatabase } from "./db";
import type { NewOperationInput, QueuedOperation } from "./types";

/**
 * Enqueues a new offline operation, applying the five deterministic
 * coalescing rules (coalesce.ts) against any existing non-SYNCING pending
 * operation for the same `[entityType, clientUuid]`. An operation with
 * status `"SYNCING"` is never touched (rule 5) — a later edit against one
 * always queues as a new, separate operation, since its outcome (success,
 * conflict, or failure) is already in flight and must not be silently
 * merged away.
 */
export async function enqueueOperation(
  db: OfflineDatabase,
  input: NewOperationInput,
): Promise<void> {
  const requestFingerprint = await computeRequestFingerprint({
    entityType: input.entityType,
    action: input.action,
    clientUuid: input.clientUuid,
    payload: input.payload,
  });
  const now = Date.now();
  const fresh: QueuedOperation = {
    ...input,
    requestFingerprint,
    status: "QUEUED",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  };

  await db.transaction("rw", db.operations, async () => {
    const candidates = await db.operations
      .where("[entityType+clientUuid]")
      .equals([input.entityType, input.clientUuid])
      .toArray();
    const pending = candidates
      .filter((op) => op.status !== "SYNCING")
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!pending) {
      await db.operations.put(fresh);
      return;
    }

    const coalesced = await coalesceOperation(pending, input);
    if (coalesced === "discard") {
      await db.operations.delete(pending.operationId);
      return;
    }
    if (coalesced === null) {
      await db.operations.put(fresh);
      return;
    }
    await db.operations.put(coalesced);
  });
}

/** Operations eligible to sync right now, oldest first. */
export async function listOperationsDueForSync(
  db: OfflineDatabase,
  now: number = Date.now(),
): Promise<QueuedOperation[]> {
  const rows = await db.operations.where("status").anyOf(["QUEUED", "FAILED"]).toArray();
  return rows.filter((op) => op.nextAttemptAt <= now).sort((a, b) => a.createdAt - b.createdAt);
}

export async function markSyncing(db: OfflineDatabase, operationId: string): Promise<void> {
  await db.operations.update(operationId, { status: "SYNCING" });
}

/** A successfully-applied (or safely-replayed) operation leaves the queue
 * entirely — there is nothing further for the Sync Center to show once the
 * server has confirmed it. */
export async function markSynced(db: OfflineDatabase, operationId: string): Promise<void> {
  await db.operations.delete(operationId);
}

/** A transient failure (network error, 5xx, timeout) — retried
 * automatically up to MAX_AUTOMATIC_ATTEMPTS, then left as "FAILED" for the
 * Sync Center's manual retry action. */
export async function markFailed(
  db: OfflineDatabase,
  operationId: string,
  errorMessage: string,
): Promise<void> {
  const op = await db.operations.get(operationId);
  if (!op) return;
  const attempts = op.attempts + 1;
  const status = attempts >= MAX_AUTOMATIC_ATTEMPTS ? "FAILED" : "QUEUED";
  const nextAttemptAt = Date.now() + computeBackoffDelayMs(attempts);
  await db.operations.update(operationId, {
    status,
    attempts,
    nextAttemptAt,
    lastError: errorMessage,
  });
}

/** A genuine version conflict (server returned `{status:"CONFLICT"}`) —
 * never retried automatically; the Sync Center prompts the user. */
export async function markConflict(
  db: OfflineDatabase,
  operationId: string,
  current: Record<string, unknown>,
  currentVersion: string,
): Promise<void> {
  await db.operations.update(operationId, {
    status: "CONFLICT",
    conflict: { current, currentVersion },
  });
}

/**
 * "Keep Local": discards the conflicted operation and re-queues its
 * payload as a brand-new operation (fresh `operationId`), using the
 * server's `currentVersion` as the new `expectedUpdatedAt` — this is what
 * lets the resubmission pass the server's stale-write check instead of
 * conflicting again immediately.
 */
export async function resolveConflictKeepLocal(
  db: OfflineDatabase,
  operationId: string,
  newOperationId: string,
): Promise<void> {
  const op = await db.operations.get(operationId);
  if (!op || op.status !== "CONFLICT" || !op.conflict) return;
  const payload =
    op.action === "ARCHIVE"
      ? { ...op.payload, expectedUpdatedAt: op.conflict.currentVersion }
      : { ...op.payload, expectedUpdatedAt: op.conflict.currentVersion };
  await db.transaction("rw", db.operations, async () => {
    await db.operations.delete(operationId);
    await enqueueOperation(db, {
      operationId: newOperationId,
      entityType: op.entityType,
      clientUuid: op.clientUuid,
      action: op.action,
      payload,
    });
  });
}

/** "Keep Server": only discards the local queued operation — the server
 * row is never touched, and this must only be called after the user has
 * explicitly confirmed (see ConflictDialog.tsx). */
export async function resolveConflictKeepServer(
  db: OfflineDatabase,
  operationId: string,
): Promise<void> {
  await db.operations.delete(operationId);
}

/** Manual retry from the Sync Center for a "FAILED" operation — resets the
 * attempt counter so the automatic-retry budget starts fresh. */
export async function retryNow(db: OfflineDatabase, operationId: string): Promise<void> {
  await db.operations.update(operationId, {
    status: "QUEUED",
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
}
