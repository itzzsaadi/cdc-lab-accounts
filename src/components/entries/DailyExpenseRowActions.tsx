"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import type { PartnerOption } from "./FundingSourceToggle";
import {
  DailyExpenseFormFields,
  OTHER_VALUE,
  type ExpenseItemOption,
  type DailyExpenseFieldsState,
} from "./DailyExpenseFormFields";
import {
  updateDailyExpenseAction,
  archiveDailyExpenseAction,
} from "../../server/actions/daily-expenses";

export interface DailyExpenseRow {
  id: string;
  expenseDate: string;
  expenseItemId: string | null;
  customDescription: string | null;
  amount: string;
  fundingSource: "BUSINESS" | "PARTNER";
  fundedByUserId: string | null;
  updatedAt: string;
  /** What the archive confirmation names — this exact record, never a generic "this entry" (NFR-USE-06). */
  displayLabel: string;
}

/**
 * FR-DEXP-09: edit and archive for one already-saved Daily Expense row.
 * Both actions submit the row's own `expectedUpdatedAt` for the atomic
 * conditional-write stale-write check already implemented in
 * `src/server/mutations/daily-expenses.ts`; a stale rejection is shown as
 * a clear "reload to see the latest" message with a Reload button
 * (`router.refresh()`) rather than a bare error, since retrying the exact
 * same stale write would only fail again.
 */
export function DailyExpenseRowActions({
  expense,
  expenseItems,
  partners,
}: {
  expense: DailyExpenseRow;
  expenseItems: ExpenseItemOption[];
  partners: PartnerOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "edit" | "archive">("none");
  const [state, setState] = useState<DailyExpenseFieldsState>(() => ({
    expenseDate: expense.expenseDate,
    itemSelection: expense.expenseItemId ?? OTHER_VALUE,
    customDescription: expense.customDescription ?? "",
    amount: expense.amount,
    fundingSource: expense.fundingSource,
    fundedByUserId: expense.fundedByUserId ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStale(false);

    const result = await updateDailyExpenseAction({
      id: expense.id,
      expectedUpdatedAt: expense.updatedAt,
      expenseDate: state.expenseDate,
      expenseItemId: state.itemSelection === OTHER_VALUE ? undefined : state.itemSelection,
      customDescription: state.itemSelection === OTHER_VALUE ? state.customDescription : undefined,
      amount: state.amount,
      fundingSource: state.fundingSource,
      fundedByUserId: state.fundingSource === "PARTNER" ? state.fundedByUserId : undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      setStale(true);
      return;
    }
    setMode("none");
    router.refresh();
  }

  async function handleArchiveConfirm() {
    setSubmitting(true);
    setError(null);
    setStale(false);

    const result = await archiveDailyExpenseAction({
      id: expense.id,
      expectedUpdatedAt: expense.updatedAt,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      setStale(true);
      return;
    }
    setMode("none");
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="text-on-surface-variant hover:text-primary hover:bg-surface-container rounded p-1 transition-colors"
          aria-label={`Edit ${expense.displayLabel}`}
        >
          <span className="material-symbols-outlined text-[20px]">edit</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("archive")}
          className="text-on-surface-variant hover:text-error hover:bg-surface-container rounded p-1 transition-colors"
          aria-label={`Archive ${expense.displayLabel}`}
        >
          <span className="material-symbols-outlined text-[20px]">archive</span>
        </button>
      </div>

      <Modal open={mode === "edit"} onClose={() => setMode("none")} title="Edit Expense">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            void handleEditSubmit(event);
          }}
        >
          <DailyExpenseFormFields
            idPrefix={`expense-edit-${expense.id}`}
            state={state}
            onChange={(next) => setState((prev) => ({ ...prev, ...next }))}
            expenseItems={expenseItems}
            partners={partners}
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
            <Button type="button" variant="secondary" onClick={() => setMode("none")}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={mode === "archive"} onClose={() => setMode("none")} title="Archive Expense">
        <div className="flex flex-col gap-5">
          <p className="text-on-surface text-sm">
            Archive <span className="font-medium">{expense.displayLabel}</span>? It will no longer
            appear in the active list, but its history is kept — this is never a permanent deletion.
          </p>
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
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setMode("none")}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive-ghost"
              disabled={submitting}
              onClick={() => void handleArchiveConfirm()}
            >
              {submitting ? "Archiving…" : "Archive"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
