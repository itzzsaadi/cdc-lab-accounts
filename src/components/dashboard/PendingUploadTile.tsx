"use client";

import Link from "next/link";
import { useOfflineSync } from "../offline/OfflineProvider";

/**
 * FR-RPT-02's second half: "Dashboard shows outstanding warnings **and
 * pending-upload count**."
 *
 * Phase 5 delivered the warnings panel and deliberately left this out —
 * no offline queue existed yet, and this codebase's standing rule
 * (Phase 3B's Operator Home) is never to display a fabricated count.
 * Phase 6 built the real queue, so the reason for that deferral has
 * expired and the tile is a real reading of device-local state, not a
 * placeholder.
 *
 * Renders nothing at all when the queue is empty: an always-present
 * "0 pending" tile is noise on the overwhelmingly common path, and the
 * FR asks the dashboard to *show outstanding* items. Conflicts and
 * failures are surfaced distinctly from ordinary pending work, since they
 * need a decision rather than just patience.
 */
export function PendingUploadTile() {
  const { pendingCount, conflictCount, failedCount } = useOfflineSync();
  const total = pendingCount + conflictCount + failedCount;

  if (total === 0) return null;

  const needsAttention = conflictCount + failedCount > 0;

  return (
    <Link
      href="/sync-center"
      className={`mb-6 flex items-center gap-3 rounded-xl border p-4 transition-colors ${
        needsAttention
          ? "border-error bg-error-container text-on-error-container"
          : "border-outline-variant bg-surface-container-lowest text-on-surface"
      }`}
    >
      <span className="material-symbols-outlined text-[24px]" aria-hidden>
        {needsAttention ? "sync_problem" : "cloud_upload"}
      </span>
      <span className="flex-1 text-sm">
        <span className="font-semibold">
          {total} {total === 1 ? "entry" : "entries"} waiting to upload
        </span>
        {needsAttention ? (
          <span className="block text-xs">
            {conflictCount > 0 ? `${conflictCount} need your decision. ` : ""}
            {failedCount > 0 ? `${failedCount} failed to sync. ` : ""}
            Open the Sync Center to resolve.
          </span>
        ) : (
          <span className="block text-xs">
            They will upload automatically once this device is back online.
          </span>
        )}
      </span>
      <span className="text-xs font-medium">Sync Center →</span>
    </Link>
  );
}
