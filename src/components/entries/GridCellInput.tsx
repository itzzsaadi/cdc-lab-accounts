"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateClientUuid } from "../../lib/client-uuid";
import {
  createDailyPartyIncomeCellAction,
  updateDailyPartyIncomeCellAction,
  archivePartyIncomeAction,
} from "../../server/actions/party-income";
import { useOfflineSync } from "../offline/OfflineProvider";
import { isLikelyOfflineError } from "../../lib/offline/submit-helpers";

export interface GridCellRecord {
  id: string;
  amount: string;
  updatedAt: string;
}

type CellStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "stale" | "confirm-clear";

/**
 * One Party Income grid cell — the full autosave state machine (approved
 * plan): idle → dirty (typing) → saving → saved (transient) or error/stale.
 * Commits on blur or Enter (Tab already moves focus natively across cells,
 * per the approved responsive/keyboard design — no custom Tab handling
 * here). Arrow-key navigation is gated on caret position for
 * left/right (only moves columns when the caret is already at the start/
 * end of the text, so normal text-cursor movement inside a cell is never
 * hijacked), matching the Stitch export's keyboard model
 * (`party_income_grid_cdc_laboratories_code.html`) reproduced here against
 * real data instead of its `Math.random()` demo fill.
 *
 * A `party_income_active_daily_cell_unique` conflict (a different
 * `clientUuid` racing for the same cell) and a stale `updatedAt` conflict
 * both surface as `status: "error"`/`"stale"` with a retry affordance —
 * never silently retried as if it were the same request.
 *
 * Every successful save also calls `router.refresh()` — row/party/grand
 * totals are computed server-side (FR-PINC-08, "calculated by the system,
 * never typed") and are not recomputed client-side on every keystroke,
 * so a refresh is what keeps them accurate after an edit. This only
 * remounts the cell(s) whose `key` (set by the parent from `id`/
 * `updatedAt`) actually changed; a cell the user has since tabbed/arrowed
 * away from keeps its own focus.
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
  // never reached the server yet -- its "id" is the offline queue's own
  // record-identity key (the client_uuid this component generated), not a
  // real database row id. Editing or clearing it again while still offline
  // enqueues another operation against that same key, which the queue's
  // coalescing rules (src/lib/offline/coalesce.ts) merge correctly.
  const [isQueuedOffline, setIsQueuedOffline] = useState(false);
  const clientUuidRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setStatus("idle");
      return;
    }

    if (record && trimmed === record.amount) {
      setStatus("idle");
      return;
    }

    /**
     * NFR-USE-06. Emptying a cell that holds a *saved* figure archives a
     * financial record, so it is confirmed by name first. The confirmation
     * is deliberately inline rather than a modal: a modal opening on blur
     * would seize focus mid-keyboard-run and break NFR-USE-02's
     * keyboard-only grid operation, which is the one requirement this
     * screen exists to satisfy. The displayed amount is restored while the
     * prompt is up, so the grid never shows a figure as gone before it
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
      setIsQueuedOffline(false);
      setStatus("saved");
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
        setStatus("saved");
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
      }
      return;
    }

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
      // syncs — the same value already used above as the queue's
      // coalescing key.
      setRecord({ id: clientUuid, amount: trimmed, updatedAt: new Date().toISOString() });
      setIsQueuedOffline(true);
      setStatus("saved");
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
      focusCell(rowIndex + 1, colIndex);
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

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        data-grid-row={rowIndex}
        data-grid-col={colIndex}
        aria-label={`Amount for ${day}`}
        readOnly={readOnly}
        disabled={readOnly}
        value={value}
        placeholder={readOnly ? "" : "-"}
        onChange={(event) => {
          setValue(event.target.value.replace(/[^0-9.]/g, ""));
          setStatus("dirty");
        }}
        onBlur={() => void commit()}
        onKeyDown={handleKeyDown}
        onFocus={(event) => event.currentTarget.select()}
        className={`tabular-nums text-on-surface h-full w-full border-2 border-transparent bg-transparent px-3 py-2 text-right transition-colors focus:bg-surface-container-lowest focus:border-primary disabled:cursor-not-allowed disabled:text-on-surface-variant ${
          status === "error" || status === "stale" ? "border-error" : ""
        }`}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {statusLabel}
      </span>
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
                // Abandoning leaves the record exactly as it was; `value`
                // was already restored before this prompt appeared.
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
