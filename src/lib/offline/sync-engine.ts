import type { OfflineDatabase } from "./db";
import {
  listOperationsDueForSync,
  markConflict,
  markFailed,
  markSyncing,
  markSynced,
} from "./queue";
import { refreshReferenceCache } from "./reference-cache";
import { verifyAuthenticatedConnection } from "./ping";
import type { RecentRecord } from "./types";

/** Batches of at most 50 operations per upload request (approved batch
 * limit — see src/lib/validation/sync.ts's identical server-side cap). */
const MAX_BATCH_SIZE = 50;

export interface SyncRunSummary {
  applied: number;
  conflicts: number;
  failed: number;
  skipped: boolean;
}

/**
 * Runs one full sync attempt: verifies a real authenticated connection
 * first (mandatory decision #2 — never trusts bare `navigator.onLine`),
 * uploads every operation currently due for sync in batches of at most
 * 50, applies each result to the local queue, and refreshes the
 * reference-data cache once if anything was applied. Never called
 * directly by UI code with an unverified connection assumption — this
 * function does its own verification every time.
 */
export async function runSync(db: OfflineDatabase): Promise<SyncRunSummary> {
  const connected = await verifyAuthenticatedConnection();
  if (!connected) {
    return { applied: 0, conflicts: 0, failed: 0, skipped: true };
  }

  const due = await listOperationsDueForSync(db);
  if (due.length === 0) {
    return { applied: 0, conflicts: 0, failed: 0, skipped: false };
  }

  let applied = 0;
  let conflicts = 0;
  let failed = 0;

  for (let i = 0; i < due.length; i += MAX_BATCH_SIZE) {
    const batch = due.slice(i, i + MAX_BATCH_SIZE);
    await Promise.all(batch.map((op) => markSyncing(db, op.operationId)));

    let response: Response;
    try {
      response = await fetch("/api/sync/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: batch.map((op) => ({
            operationId: op.operationId,
            entityType: op.entityType,
            action: op.action,
            clientUuid: op.clientUuid,
            payload: op.payload,
          })),
        }),
      });
    } catch (error) {
      // Network failure mid-batch: every operation in it goes back to
      // FAILED/retry, never silently dropped.
      await Promise.all(
        batch.map((op) =>
          markFailed(db, op.operationId, error instanceof Error ? error.message : "Network error."),
        ),
      );
      failed += batch.length;
      continue;
    }

    if (!response.ok) {
      const message = `Upload failed with status ${response.status}.`;
      await Promise.all(batch.map((op) => markFailed(db, op.operationId, message)));
      failed += batch.length;
      continue;
    }

    const { results } = (await response.json()) as {
      results: { operationId: string; status: string; body: unknown }[];
    };
    const byId = new Map(results.map((r) => [r.operationId, r]));

    for (const op of batch) {
      const result = byId.get(op.operationId);
      if (!result) {
        await markFailed(db, op.operationId, "No result returned for this operation.");
        failed += 1;
        continue;
      }
      if (result.status === "APPLIED") {
        await recordRecentRecord(db, op);
        await markSynced(db, op.operationId);
        applied += 1;
      } else if (result.status === "CONFLICT") {
        const body = result.body as { current: Record<string, unknown>; currentVersion: string };
        await markConflict(db, op.operationId, body.current, body.currentVersion);
        conflicts += 1;
      } else {
        const body = result.body as { error?: string };
        await markFailed(db, op.operationId, body.error ?? "Rejected by server.");
        failed += 1;
      }
    }
  }

  if (applied > 0) {
    await refreshReferenceCache(db);
  }

  return { applied, conflicts, failed, skipped: false };
}

/** FR-OFF-14: keeps the last N synced rows per entity visible offline even
 * after the tab reloads — a lightweight courtesy cache, never a
 * substitute for a live query when online. */
async function recordRecentRecord(
  db: OfflineDatabase,
  op: { operationId: string; entityType: RecentRecord["entityType"]; payload: Record<string, unknown> },
): Promise<void> {
  await db.recentRecords.put({
    id: op.operationId,
    entityType: op.entityType,
    syncedAt: Date.now(),
    data: op.payload,
  });
}
