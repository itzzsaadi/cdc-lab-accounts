"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateClientUuid } from "../../lib/client-uuid";
import {
  createDailyPartyIncomeCellAction,
  updateDailyPartyIncomeCellAction,
  archivePartyIncomeAction,
} from "../../server/actions/party-income";
import { useOfflineSync } from "../offline/OfflineProvider";
import { isLikelyOfflineError } from "../../lib/offline/submit-helpers";
import { formatMoney } from "../../lib/domain/money-format";

export interface GridCellRecord {
  id: string;
  amount: string;
  updatedAt: string;
}

type CellStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "stale" | "confirm-clear";

/**
 * One Party Income grid cell.
 *
 * VIEW MODE (default): the saved amount (or a dash for an empty cell) is
 * displayed as plain text. A pencil-icon edit button appears on row hover
 * (or when the cell is focused via keyboard). Clicking it enters EDIT MODE.
 * Archived-party cells suppress the edit button via the `readOnly` prop.
 *
 * EDIT MODE: the original autosave state machine is fully preserved —
 * idle → dirty (typing) → saving → saved (transient) or error/stale.
 * Commits on blur or Enter. Escape cancels and returns to view mode without
 * saving. Arrow-key navigation is gated on caret position for left/right.
 *
 * Every successful save calls `router.refresh()` so server-computed
 * row/party/grand totals stay accurate (FR-PINC-08). After a save the cell
 * returns to view mode showing the updated figure.
 */
export function GridCellInput({
  partyId,
  partyName,
  day,
  initialRecord,
  readOnly,
  rowIndex,
  colIndex,
}: {
  partyId: string;
  partyName: string;
  day: string;
  initialRecord: GridCellRecord | null;
  readOnly: boolean;
  rowIndex: number;
  colIndex: number;
}) {
  const router = useRouter();
  const { enqueue } = useOfflineSync();
  const [record, setRecord] = useState<GridCellRecord | null>(initialRecord);
  const [value, setValue] = useState(initialRecord?.amount ?? "");
  const [status, setStatus] = useState<CellStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // True only while `record` represents a cell created offline that has
  // never reached the server yet — its "id" is the offline queue's own
  // record-identity key (the client_uuid this component generated), not a
  // real database row id. Editing or clearing it again while still offline
  // enqueues another operation against that same key, which the queue's
  // coalescing rules (src/lib/offline/coalesce.ts) merge correctly.
  const [isQueuedOffline, setIsQueuedOffline] = useState(false);
  // Whether the cell is in edit mode (input visible) vs view mode (display text).
  const [editing, setEditing] = useState(false);
  const clientUuidRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the input whenever edit mode opens.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function enterEditMode() {
    if (readOnly) return;
    // Reset value to the current saved amount so the input always starts
    // with the real figure, not a leftover dirty value from a prior session.
    setValue(record?.amount ?? "");
    setStatus("idle");
    setMessage(null);
    setEditing(true);
  }

  function exitEditMode() {
    setEditing(false);
    setStatus("idle");
    setMessage(null);
    // Return focus to the edit button so keyboard users don't lose their place.
    editBtnRef.current?.focus();
  }

  function focusCell(nextRow: number, nextCol: number) {
    const target = document.querySelector<HTMLInputElement>(
      `input[data-grid-row="${nextRow}"][data-grid-col="${nextCol}"]`,
    );
    target?.focus();
  }

  /** `overrideValue` exists only for the confirm-clear path below, which must act on `""` immediately rather than wait for a `setValue` state update to land. */
  async function commit(overrideValue?: string) {
    const trimmed = (overrideValue ?? value).trim();

    if (trimmed === "" && !record) {
      // Nothing to save and no existing record — just close edit mode.
      exitEditMode();
      return;
    }

    if (record && trimmed === record.amount) {
      // No change — close edit mode without hitting the server.
      exitEditMode();
      return;
    }

    /**
     * NFR-USE-06. Emptying a cell that holds a *saved* figure archives a
     * financial record, so it is confirmed by name first. The confirmation
     * is deliberately inline rather than a modal: a modal opening on blur
     * would seize focus mid-keyboard-run and break NFR-USE-02's
     * keyboard-only grid operation. The displayed amount is restored while
     * the prompt is up, so the grid never shows a figure as gone before it
     * actually is, and abandoning the cell simply leaves the record intact.
     *
     * A cell that only ever existed in the offline queue is excluded: that
     * discards a local draft the server has never seen, which is not the
     * archiving of a financial record NFR-USE-06 governs.
     */
    if (trimmed === "" && record && !isQueuedOffline && status !== "confirm-clear") {
      setValue(record.amount);
      setMessage(null);
      setStatus("confirm-clear");
      return;
    }

    setStatus("saving");
    setMessage(null);

    // Clearing a cell that was itself only ever queued offline: discard
    // the pending CREATE entirely (coalescing rule 2) — nothing was ever
    // sent to the server, so there is nothing to archive there either.
    if (trimmed === "" && record && isQueuedOffline) {
      await enqueue({
        operationId: crypto.randomUUID(),
        entityType: "party_income_daily",
        action: "ARCHIVE",
        clientUuid: record.id,
        payload: { id: record.id, expectedUpdatedAt: record.updatedAt },
      });
      setRecord(null);
      setValue("");
      setIsQueuedOffline(false);
      setStatus("saved");
      setEditing(false);
      return;
    }

    if (trimmed === "" && record) {
      try {
        const result = await archivePartyIncomeAction({
          id: record.id,
          expectedUpdatedAt: record.updatedAt,
        });
        if (!result.ok) {
          // The confirm-clear path restored the figure into `value` before
          // prompting, so a refused archive must put the cell back to
          // showing that figure rather than an empty box.
          setValue(record.amount);
          setStatus("stale");
          setMessage(result.error);
          return;
        }
        setRecord(null);
        setValue("");
        setStatus("saved");
        setEditing(false);
        router.refresh(); // refreshes the grid's server-computed row/party/grand totals
      } catch (submitError) {
        if (!isLikelyOfflineError(submitError)) {
          setStatus("error");
          setMessage("Could not save — check your connection and try again.");
          return;
        }
        await enqueue({
          operationId: crypto.randomUUID(),
          entityType: "party_income_daily",
          action: "ARCHIVE",
          clientUuid: record.id,
          payload: { id: record.id, expectedUpdatedAt: record.updatedAt },
        });
        setRecord(null);
        setValue("");
        setStatus("saved");
        setEditing(false);
      }
      return;
    }

    if (record) {
      const nextUpdatedAt = new Date().toISOString();
      if (isQueuedOffline) {
        await enqueue({
          operationId: crypto.randomUUID(),
          entityType: "party_income_daily",
          action: "UPDATE",
          clientUuid: record.id,
          payload: { id: record.id, expectedUpdatedAt: record.updatedAt, amount: trimmed },
        });
        setRecord({ id: record.id, amount: trimmed, updatedAt: nextUpdatedAt });
        setStatus("saved");
        setEditing(false);
        return;
      }
      try {
        const result = await updateDailyPartyIncomeCellAction({
          id: record.id,
          expectedUpdatedAt: record.updatedAt,
          amount: trimmed,
        });
        if (!result.ok) {
          setStatus("stale");
          setMessage(result.error);
          return;
        }
        setRecord({ id: record.id, amount: trimmed, updatedAt: nextUpdatedAt });
        setStatus("saved");
        setEditing(false);
        router.refresh();
      } catch (submitError) {
        if (!isLikelyOfflineError(submitError)) {
          setStatus("error");
          setMessage("Could not save — check your connection and try again.");
          return;
        }
        await enqueue({
          operationId: crypto.randomUUID(),
          entityType: "party_income_daily",
          action: "UPDATE",
          clientUuid: record.id,
          payload: { id: record.id, expectedUpdatedAt: record.updatedAt, amount: trimmed },
        });
        setRecord({ id: record.id, amount: trimmed, updatedAt: nextUpdatedAt });
        setStatus("saved");
        setEditing(false);
      }
      return;
    }

    // CREATE — new cell
    clientUuidRef.current ??= generateClientUuid();
    const clientUuid = clientUuidRef.current;
    const payload = { clientUuid, partyId, incomeDate: day, amount: trimmed };
    try {
      const result = await createDailyPartyIncomeCellAction(payload);
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setRecord({ id: result.id, amount: trimmed, updatedAt: new Date().toISOString() });
      clientUuidRef.current = null;
      setStatus("saved");
      setEditing(false);
      router.refresh();
    } catch (submitError) {
      if (!isLikelyOfflineError(submitError)) {
        setStatus("error");
        setMessage("Could not save — check your connection and try again.");
        return;
      }
      await enqueue({
        operationId: crypto.randomUUID(),
        entityType: "party_income_daily",
        action: "CREATE",
        clientUuid,
        payload: { ...payload, capturedAt: new Date().toISOString() },
      });
      // The clientUuid stands in as this cell's local record id until it
      // syncs — the same value already used above as the queue's coalescing key.
      setRecord({ id: clientUuid, amount: trimmed, updatedAt: new Date().toISOString() });
      setIsQueuedOffline(true);
      setStatus("saved");
      setEditing(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      // Restore the original value and exit edit mode without saving.
      setValue(record?.amount ?? "");
      exitEditMode();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(rowIndex - 1, colIndex);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(rowIndex + 1, colIndex);
    } else if (event.key === "ArrowLeft" && input.selectionStart === 0) {
      event.preventDefault();
      focusCell(rowIndex, colIndex - 1);
    } else if (event.key === "ArrowRight" && input.selectionEnd === input.value.length) {
      event.preventDefault();
      focusCell(rowIndex, colIndex + 1);
    }
  }

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? isQueuedOffline
          ? "Saved offline — will sync automatically"
          : "Saved"
        : status === "error"
          ? `Error: ${message}`
          : status === "stale"
            ? `Not saved: ${message}`
            : status === "confirm-clear"
              ? `Confirm clearing the income recorded for ${partyName} on ${day}`
              : "";

  // ── VIEW MODE ──────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="group/cell relative flex h-full min-h-[2.5rem] items-center justify-end px-3 py-2">
        {/* Saved amount or dash placeholder */}
        <span
          className={`tabular-nums text-right text-sm ${record ? "text-on-surface" : "text-on-surface-variant"}`}
        >
          {record ? formatMoney(record.amount) : "–"}
        </span>

        {/* Edit button — hidden on archived columns, revealed on row hover or focus */}
        {!readOnly ? (
          <button
            ref={editBtnRef}
            type="button"
            onClick={enterEditMode}
            aria-label={`Edit income for ${partyName} on ${day}`}
            className="text-on-surface-variant hover:text-primary hover:bg-surface-container focus-visible:text-primary focus-visible:bg-surface-container absolute top-1/2 left-1 -translate-y-1/2 rounded p-0.5 opacity-0 transition-all group-hover/cell:opacity-100 focus-visible:opacity-100"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
          </button>
        ) : null}

        {/* Offline badge */}
        {isQueuedOffline && record ? (
          <span
            title="Saved offline — will sync automatically"
            className="text-primary absolute top-0.5 right-0.5 text-[10px] leading-none"
            aria-label="Saved offline"
          >
            ●
          </span>
        ) : null}
      </div>
    );
  }

  // ── EDIT MODE ──────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        data-grid-row={rowIndex}
        data-grid-col={colIndex}
        aria-label={`Edit amount for ${partyName} on ${day}`}
        value={value}
        placeholder="-"
        onChange={(event) => {
          setValue(event.target.value.replace(/[^0-9.]/g, ""));
          setStatus("dirty");
        }}
        onBlur={() => void commit()}
        onKeyDown={handleKeyDown}
        onFocus={(event) => event.currentTarget.select()}
        className={`tabular-nums text-on-surface h-full w-full border-2 bg-surface-container-lowest px-3 py-2 text-right transition-colors focus:border-primary ${
          status === "error" || status === "stale" ? "border-error" : "border-primary"
        }`}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {statusLabel}
      </span>

      {/* Confirm-clear inline popover */}
      {status === "confirm-clear" ? (
        <div
          className="border-outline-variant bg-surface-container-lowest absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border p-3 shadow-lg"
          role="group"
          aria-label={`Confirm clearing ${partyName} on ${day}`}
        >
          <p className="text-on-surface mb-2 text-left text-xs">
            Clear the income recorded for <span className="font-medium">{partyName}</span> on{" "}
            <span className="font-medium">{day}</span>? It is archived, not deleted.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="text-on-surface-variant text-xs font-medium"
              onClick={() => {
                // Abandoning leaves the record exactly as it was.
                setStatus("idle");
                inputRef.current?.focus();
              }}
            >
              Keep
            </button>
            <button
              type="button"
              className="text-error text-xs font-medium"
              onClick={() => void commit("")}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Retry / Reload affordances */}
      {status === "error" ? (
        <button
          type="button"
          onClick={() => void commit()}
          title={message ?? undefined}
          className="text-error absolute top-1/2 left-1 -translate-y-1/2 text-xs underline"
        >
          Retry
        </button>
      ) : null}
      {status === "stale" ? (
        <button
          type="button"
          onClick={() => router.refresh()}
          title={message ?? undefined}
          className="text-error absolute top-1/2 left-1 -translate-y-1/2 text-xs underline"
        >
          Reload
        </button>
      ) : null}
    </div>
  );
}
