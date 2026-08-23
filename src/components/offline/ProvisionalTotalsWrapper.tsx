"use client";

import type { ReactNode } from "react";
import { useOfflineSync } from "./OfflineProvider";
import { operationsAffectingRange } from "../../lib/offline/relevance";

/**
 * FR-OFF-12: wraps the server-rendered total tiles so a viewer can tell,
 * at a glance and not just from the banner text above, which figures are
 * still provisional — a dashed amber ring plus a small corner label,
 * applied only while this device's own offline queue holds something
 * unsynced for the period being shown (`from`/`to`, both `YYYY-MM-DD`).
 * Confirmed totals (the common case — nothing queued, or nothing queued
 * for this period) render with no visual difference at all.
 */
export function ProvisionalTotalsWrapper({
  from,
  to,
  children,
}: {
  from: string;
  to: string;
  children: ReactNode;
}) {
  const { operations } = useOfflineSync();
  const isProvisional = operationsAffectingRange(operations, from, to).length > 0;

  if (!isProvisional) {
    return <>{children}</>;
  }

  return (
    <div className="relative rounded-xl ring-2 ring-[#f59e0b] ring-offset-2 ring-offset-background">
      <span className="bg-[#f59e0b] text-on-primary absolute -top-3 left-3 rounded-full px-2 py-0.5 text-xs font-semibold">
        Provisional
      </span>
      {children}
    </div>
  );
}
