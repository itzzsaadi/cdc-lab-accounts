"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { Textarea } from "../ui/Textarea";
import { HistoryButton } from "./HistoryButton";
import { updateCounterIncomeAction } from "../../server/actions/counter-income";

export interface CounterIncomeRow {
  id: string;
  incomeDate: string;
  amount: string;
  note: string | null;
  updatedAt: string;
}

/**
 * FR-CINC row-level actions: edit (amount + note) and history.
 *
 * Editing the `incomeDate` is intentionally not supported — the update
 * mutation only allows changing `amount` and `note` (matching
 * `updateCounterIncomeSchema`). The same optimistic concurrency token
 * (`expectedUpdatedAt`) used throughout the codebase is applied here: a
 * stale-write rejection surfaces as a clear "reload to see the latest"
 * message with a Reload button rather than a bare error.
 */
export function CounterIncomeRowActions({
  item,
  canViewHistory,
}: {
  item: CounterIncomeRow;
  canViewHistory: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(item.amount);
  const [note, setNote] = useState(item.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleOpen() {
    // Reset to the current saved values each time the modal opens.
    setAmount(item.amount);
    setNote(item.note ?? "");
    setError(null);
    setStale(false);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStale(false);

    const result = await updateCounterIncomeAction({
      id: item.id,
      expectedUpdatedAt: item.updatedAt,
      amount,
      note: note.trim() || undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      if (result.error.toLowerCase().includes("changed elsewhere")) {
        setStale(true);
      }
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const displayLabel = `Counter Income ${item.incomeDate}`;

  return (
    <>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={handleOpen}
          className="text-on-surface-variant hover:text-primary hover:bg-surface-container rounded p-1 transition-colors"
          aria-label={`Edit ${displayLabel}`}
        >
          <span className="material-symbols-outlined text-[20px]">edit</span>
        </button>
        {canViewHistory ? (
          <HistoryButton
            entityType="counter_income"
            entityId={item.id}
            displayLabel={displayLabel}
          />
        ) : null}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Edit Counter Income">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          {/* Date is read-only — the update mutation does not allow changing it. */}
          <TextInput
            id={`counter-income-edit-date-${item.id}`}
            label="Date"
            type="date"
            value={item.incomeDate}
            onChange={() => undefined}
            disabled
          />
          <TextInput
            id={`counter-income-edit-amount-${item.id}`}
            label="Amount (PKR)"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            required
          />
          <Textarea
            id={`counter-income-edit-note-${item.id}`}
            label="Note (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
          />
          {error ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-error text-sm">{error}</p>
              {stale ? (
                <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                  Reload
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
