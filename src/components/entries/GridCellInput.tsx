"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateClientUuid } from "../../lib/client-uuid";
import {
  createDailyPartyIncomeCellAction,
  updateDailyPartyIncomeCellAction,
  archivePartyIncomeAction,
} from "../../server/actions/party-income";

export interface GridCellRecord {
  id: string;
  amount: string;
  updatedAt: string;
}

type CellStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "stale";

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
  day,
  initialRecord,
  readOnly,
  rowIndex,
  colIndex,
}: {
  partyId: string;
  day: string;
  initialRecord: GridCellRecord | null;
  readOnly: boolean;
  rowIndex: number;
  colIndex: number;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<GridCellRecord | null>(initialRecord);
  const [value, setValue] = useState(initialRecord?.amount ?? "");
  const [status, setStatus] = useState<CellStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const clientUuidRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function focusCell(nextRow: number, nextCol: number) {
    const target = document.querySelector<HTMLInputElement>(
      `input[data-grid-row="${nextRow}"][data-grid-col="${nextCol}"]`,
    );
    target?.focus();
  }

  async function commit() {
    const trimmed = value.trim();

    if (trimmed === "" && !record) {
      setStatus("idle");
      return;
    }

    if (record && trimmed === record.amount) {
      setStatus("idle");
      return;
    }

    setStatus("saving");
    setMessage(null);

    try {
      if (trimmed === "" && record) {
        const result = await archivePartyIncomeAction({
          id: record.id,
          expectedUpdatedAt: record.updatedAt,
        });
        if (!result.ok) {
          setStatus("stale");
          setMessage(result.error);
          return;
        }
        setRecord(null);
        setStatus("saved");
        router.refresh(); // refreshes the grid's server-computed row/party/grand totals
        return;
      }

      if (record) {
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
        setRecord({ id: record.id, amount: trimmed, updatedAt: new Date().toISOString() });
        setStatus("saved");
        router.refresh();
        return;
      }

      clientUuidRef.current ??= generateClientUuid();
      const result = await createDailyPartyIncomeCellAction({
        clientUuid: clientUuidRef.current,
        partyId,
        incomeDate: day,
        amount: trimmed,
      });
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setRecord({ id: result.id, amount: trimmed, updatedAt: new Date().toISOString() });
      clientUuidRef.current = null;
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Could not save — check your connection and try again.");
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
        ? "Saved"
        : status === "error"
          ? `Error: ${message}`
          : status === "stale"
            ? `Not saved: ${message}`
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
