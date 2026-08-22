"use client";

import { useOfflineSync } from "./OfflineProvider";

/**
 * FR-OFF-03's header connection/pending-count indicator — the one place
 * this app tells the user "you have unsynced work" or "you're offline",
 * consistently across every screen (previously inconsistent across
 * screens; fixed as part of Phase 6, see docs/adr/0008-phase-6-offline-
 * sync.md). Reads state from `OfflineProvider`; never a second, competing
 * source of truth for connection/queue state.
 */
export function SyncStatusIndicator() {
  const { isOnline, isSyncing, pendingCount, conflictCount, failedCount } = useOfflineSync();

  if (conflictCount > 0) {
    return (
      <span className="bg-error-container text-on-error-container flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium">
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          warning
        </span>
        {conflictCount} need{conflictCount === 1 ? "s" : ""} your attention
      </span>
    );
  }

  if (failedCount > 0) {
    return (
      <span className="bg-error-container text-on-error-container flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium">
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          sync_problem
        </span>
        {failedCount} failed to sync
      </span>
    );
  }

  if (isSyncing) {
    return (
      <span className="bg-surface-container-highest text-on-surface-variant flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium">
        <span className="material-symbols-outlined animate-spin text-[16px]" aria-hidden>
          sync
        </span>
        Syncing…
      </span>
    );
  }

  if (!isOnline) {
    return (
      <span className="bg-surface-container-highest text-on-surface-variant flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium">
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          cloud_off
        </span>
        Offline{pendingCount > 0 ? ` — ${pendingCount} pending` : ""}
      </span>
    );
  }

  if (pendingCount > 0) {
    return (
      <span className="bg-surface-container-highest text-on-surface-variant flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium">
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          cloud_sync
        </span>
        {pendingCount} pending
      </span>
    );
  }

  return (
    <span className="text-on-surface-variant flex items-center gap-1 text-xs" title="All entries synced">
      <span className="material-symbols-outlined text-[16px]" aria-hidden>
        cloud_done
      </span>
    </span>
  );
}
