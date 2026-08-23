"use client";

import { useOfflineSync } from "./OfflineProvider";
import { operationsAffectingRange } from "../../lib/offline/relevance";
import { Alert } from "../ui/Alert";

/**
 * FR-OFF-12: the server-rendered totals on this page (Dashboard, Monthly
 * Summary) are computed from confirmed rows only — they cannot see this
 * device's own not-yet-synced offline queue at all, since that queue lives
 * entirely in this browser's IndexedDB. This client-only notice is what
 * tells the user the figures above it might still change: it reads the
 * local queue directly and, only when something still unsynced actually
 * falls inside the period the page is showing (`from`/`to`, both
 * `YYYY-MM-DD`), renders a visible "provisional" banner naming how many
 * entries and what will happen once they finish syncing (or once a
 * conflict is resolved) — never silently, and never for unrelated queued
 * entries from a different period.
 */
export function ProvisionalNotice({ from, to }: { from: string; to: string }) {
  const { operations } = useOfflineSync();
  const relevant = operationsAffectingRange(operations, from, to);

  if (relevant.length === 0) {
    return null;
  }

  const conflictCount = relevant.filter((op) => op.status === "CONFLICT").length;
  const failedCount = relevant.filter((op) => op.status === "FAILED").length;

  return (
    <Alert variant="warning" role="status">
      <p className="font-medium">
        Provisional — {relevant.length} {relevant.length === 1 ? "entry" : "entries"} from this
        period {relevant.length === 1 ? "hasn't" : "haven't"} finished syncing yet.
      </p>
      <p className="mt-1">
        The figures below are computed from confirmed, synced entries only and will update once{" "}
        {relevant.length === 1 ? "this entry" : "these entries"} sync
        {conflictCount > 0 || failedCount > 0 ? (
          <>
            {" "}
            —{" "}
            {[
              conflictCount > 0
                ? `${conflictCount} need${conflictCount === 1 ? "s" : ""} your attention in Sync Center`
                : null,
              failedCount > 0 ? `${failedCount} failed and will retry` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </>
        ) : (
          "."
        )}
      </p>
    </Alert>
  );
}
