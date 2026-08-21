"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import type { PartnerOption } from "./FundingSourceToggle";
import {
  MonthlyExpenseFormFields,
  type CategoryOption,
  type VendorOption,
  type MonthlyExpenseFieldsState,
} from "./MonthlyExpenseFormFields";
import {
  updateMonthlyExpenseAction,
  archiveMonthlyExpenseAction,
} from "../../server/actions/monthly-expenses";

export interface MonthlyExpenseRow {
  id: string;
  periodMonth: string;
  categoryId: string;
  vendorId: string | null;
  description: string | null;
  amount: string;
  fundingSource: "BUSINESS" | "PARTNER";
  fundedByUserId: string | null;
  updatedAt: string;
  displayLabel: string;
  /** System-generated instalment lines (`assetId` set) are read-only here — corrections happen by editing the asset or via next month's own generation, never a direct edit of a past instalment amount through this action (they may still be archived if truly needed). */
  isSystemGenerated: boolean;
}

/** FR-MEXP-07: edit and archive for one already-saved Monthly Expense row — same atomic conditional-write shape as `DailyExpenseRowActions`. */
export function MonthlyExpenseRowActions({
  expense,
  categories,
  vendors,
  partners,
}: {
  expense: MonthlyExpenseRow;
  categories: CategoryOption[];
  vendors: VendorOption[];
  partners: PartnerOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "edit" | "archive">("none");
  const [state, setState] = useState<MonthlyExpenseFieldsState>(() => ({
    categoryId: expense.categoryId,
    vendorId: expense.vendorId ?? "",
    description: expense.description ?? "",
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

    const result = await updateMonthlyExpenseAction({
      id: expense.id,
      expectedUpdatedAt: expense.updatedAt,
      periodMonth: expense.periodMonth,
      categoryId: state.categoryId,
      vendorId: state.vendorId || undefined,
      description: state.description || undefined,
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

    const result = await archiveMonthlyExpenseAction({
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
          disabled={expense.isSystemGenerated}
          className="text-on-surface-variant hover:text-primary hover:bg-surface-container disabled:opacity-40 rounded p-1 transition-colors"
          aria-label={`Edit ${expense.displayLabel}`}
          title={
            expense.isSystemGenerated
              ? "System-generated instalment line — archive to remove"
              : undefined
          }
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

      <Modal open={mode === "edit"} onClose={() => setMode("none")} title="Edit Monthly Expense">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            void handleEditSubmit(event);
          }}
        >
          <MonthlyExpenseFormFields
            idPrefix={`monthly-expense-edit-${expense.id}`}
            state={state}
            onChange={(next) => setState((prev) => ({ ...prev, ...next }))}
            categories={categories}
            vendors={vendors}
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

      <Modal
        open={mode === "archive"}
        onClose={() => setMode("none")}
        title="Archive Monthly Expense"
      >
        <div className="flex flex-col gap-5">
          <p className="text-on-surface text-sm">
            Archive <span className="font-medium">{expense.displayLabel}</span>? It will no longer
            appear in the active list, but its history is kept.
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
