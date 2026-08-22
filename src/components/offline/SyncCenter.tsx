"use client";

import { useState } from "react";
import { useOfflineSync } from "./OfflineProvider";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import type { QueuedOperation } from "../../lib/offline/types";

const ENTITY_LABELS: Record<QueuedOperation["entityType"], string> = {
  daily_expense: "Daily Expense",
  monthly_expense: "Monthly Expense",
  counter_income: "Counter Income",
  party_income_daily: "Party Income",
  party_income_cash_receipt: "Cash Receipt",
  party_income_monthly_bill: "Monthly Party Bill",
};

const STATUS_LABELS: Record<QueuedOperation["status"], string> = {
  QUEUED: "Pending",
  SYNCING: "Syncing…",
  SYNCED: "Synced",
  FAILED: "Failed",
  CONFLICT: "Conflict",
};

function summaryLine(op: QueuedOperation): string {
  const amount = op.payload["amount"];
  const date =
    op.payload["expenseDate"] ?? op.payload["incomeDate"] ?? op.payload["periodMonth"] ?? "";
  const parts = [String(date || ""), amount ? `Rs ${amount}` : ""].filter(Boolean);
  return parts.join(" · ");
}

/**
 * FR-OFF Sync Center — re-implements the approved queue-list +
 * split-comparison layout from `docs/ui/stitch-export/
 * offline_sync_center_code.html` (never that file itself, per CLAUDE.md's
 * raw-Stitch-export rule) with the real four SRS-specified offline entity
 * types and real conflict data, deliberately never the handoff's worked
 * "Calibration Status"/"Next Due Date" example — see
 * docs/UI_REQUIREMENTS.md §25 decision 2c.
 */
export function SyncCenter() {
  const {
    operations,
    isSyncing,
    triggerSyncNow,
    resolveKeepLocal,
    resolveKeepServer,
    retry,
  } = useOfflineSync();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conflicted = operations.filter((op) => op.status === "CONFLICT");
  const others = operations.filter((op) => op.status !== "CONFLICT");
  const selected =
    operations.find((op) => op.operationId === selectedId) ?? conflicted[0] ?? null;

  if (operations.length === 0) {
    return (
      <EmptyState
        title="Nothing to sync"
        description="Every entry you've made has been saved to the server."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-gutter min-h-[500px] lg:grid-cols-12">
      {/* Queue panel */}
      <div className="border-outline-variant bg-surface flex flex-col overflow-hidden rounded-xl border lg:col-span-4">
        <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-between border-b p-4">
          <h3 className="text-on-surface font-semibold">Upload Queue</h3>
          <div className="flex items-center gap-2">
            <span className="text-on-surface-variant bg-surface-container rounded-md px-2 py-1 text-xs">
              {operations.length} {operations.length === 1 ? "item" : "items"}
            </span>
            <Button variant="secondary" className="h-8 px-3 text-xs" onClick={triggerSyncNow} disabled={isSyncing}>
              {isSyncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {[...conflicted, ...others].map((op) => (
            <button
              key={op.operationId}
              type="button"
              onClick={() => setSelectedId(op.operationId)}
              className={`group relative flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                selected?.operationId === op.operationId
                  ? "border-primary bg-surface-container-low"
                  : "hover:border-outline-variant hover:bg-surface-container-lowest border-transparent"
              }`}
            >
              {selected?.operationId === op.operationId ? (
                <div className="bg-primary absolute top-0 bottom-0 left-0 w-1" />
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-on-surface font-medium">{ENTITY_LABELS[op.entityType]}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${
                    op.status === "CONFLICT" || op.status === "FAILED"
                      ? "bg-error-container text-on-error-container"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {STATUS_LABELS[op.status]}
                </span>
              </div>
              <span className="text-on-surface-variant text-xs">{summaryLine(op)}</span>
              {op.lastError ? (
                <span className="text-error text-xs">{op.lastError}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Detail / comparison workspace */}
      <div className="border-outline-variant bg-surface flex flex-col overflow-hidden rounded-xl border lg:col-span-8">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState title="Select an item" description="Choose an item from the queue to see its details." />
          </div>
        ) : selected.status === "CONFLICT" && selected.conflict ? (
          <>
            <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-between border-b p-4">
              <h3 className="text-on-surface font-semibold">
                Reviewing: {ENTITY_LABELS[selected.entityType]}
              </h3>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="border-outline-variant bg-surface-bright flex w-1/2 flex-col border-r">
                <div className="border-outline-variant bg-surface-container-low flex items-center justify-between border-b p-3">
                  <span className="text-on-surface font-bold">Local Version</span>
                  <span className="text-on-surface-variant text-xs">Your Device</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <FieldList data={selected.payload} />
                </div>
              </div>
              <div className="bg-surface flex w-1/2 flex-col">
                <div className="border-outline-variant flex items-center justify-between border-b p-3">
                  <span className="text-on-surface font-bold">Server Version</span>
                  <span className="text-on-surface-variant text-xs">Database</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <FieldList data={selected.conflict.current} />
                </div>
              </div>
            </div>
            <div className="border-outline-variant bg-surface/90 flex items-center justify-end gap-3 border-t p-4">
              <Button variant="secondary" onClick={() => resolveKeepServer(selected.operationId)}>
                Keep Server Version
              </Button>
              <Button onClick={() => resolveKeepLocal(selected.operationId)}>Keep Local Version</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-4 p-6">
            <h3 className="text-on-surface font-semibold">{ENTITY_LABELS[selected.entityType]}</h3>
            <FieldList data={selected.payload} />
            {selected.status === "FAILED" ? (
              <div className="mt-4">
                <p className="text-error mb-2 text-sm">{selected.lastError}</p>
                <Button onClick={() => retry(selected.operationId)}>Retry now</Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldList({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([key]) => key !== "clientUuid");
  return (
    <div className="flex flex-col gap-3">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-on-surface-variant text-xs tracking-wide uppercase">{key}</label>
          <div className="bg-surface-container-lowest border-outline-variant text-on-surface rounded border p-2 text-sm">
            {String(value)}
          </div>
        </div>
      ))}
    </div>
  );
}
