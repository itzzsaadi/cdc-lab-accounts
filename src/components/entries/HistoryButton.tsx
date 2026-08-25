"use client";

import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Alert } from "../ui/Alert";
import { formatKarachiTimestamp } from "../../lib/domain/calendar-date";
import { diffAuditValues } from "../../lib/domain/audit-diff";
import { getEntityHistoryAction } from "../../server/actions/audit-log";
import type { AuditLogEntry } from "../../server/queries/audit-log";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  ARCHIVE: "Archived",
};

/** A field-by-field before/after listing for one audit row — values already redacted upstream by `redactSensitiveValues` (defense in depth: this component never itself decides what is safe to show). The actual diffing (which fields changed, and each field appearing exactly once) is `diffAuditValues`, a pure function unit-tested separately — this component only renders its result. */
function ValueDiff({ oldValues, newValues }: { oldValues: unknown; newValues: unknown }) {
  const diffs = diffAuditValues(oldValues, newValues);

  if (diffs.length === 0) {
    return null;
  }

  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {diffs.map(({ key, before, after, changed }) => (
        <div key={key} className="contents">
          <dt className="text-on-surface-variant font-medium">{key}</dt>
          <dd className="text-on-surface">
            {before !== undefined ? (
              <span className={changed ? "line-through" : ""}>{String(before)}</span>
            ) : null}
            {before !== undefined && after !== undefined && changed ? " → " : ""}
            {after !== undefined && changed ? <span>{String(after)}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** FR-AUD-05: one record's own change history, reached from that record's own row actions — every entity that carries an `entityType`/`entityId` audit trail gets this same button. */
export function HistoryButton({
  entityType,
  entityId,
  displayLabel,
}: {
  entityType: string;
  entityId: string;
  displayLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AuditLogEntry[] | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const result = await getEntityHistoryAction(entityType, entityId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems(result.items);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleOpen()}
        className="text-on-surface-variant hover:text-primary hover:bg-surface-container rounded p-1 transition-colors"
        aria-label={`View history for ${displayLabel}`}
      >
        <span className="material-symbols-outlined text-[20px]">history</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`History — ${displayLabel}`}>
        <div className="flex flex-col gap-3">
          {loading ? <p className="text-on-surface-variant text-sm">Loading…</p> : null}
          {error ? <Alert variant="error">{error}</Alert> : null}
          {!loading && !error && items && items.length === 0 ? (
            <p className="text-on-surface-variant text-sm">No history recorded.</p>
          ) : null}
          {items && items.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id} className="border-outline-variant rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface text-sm font-medium">
                      {ACTION_LABELS[item.action] ?? item.action}
                    </span>
                    <span className="text-on-surface-variant text-xs">
                      {formatKarachiTimestamp(new Date(item.capturedAt))}
                    </span>
                  </div>
                  <p className="text-on-surface-variant mt-1 text-xs">
                    By {item.actorName ?? "Unknown"}
                  </p>
                  <ValueDiff oldValues={item.oldValues} newValues={item.newValues} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
