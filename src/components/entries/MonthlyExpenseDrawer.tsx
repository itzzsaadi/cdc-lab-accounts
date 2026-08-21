"use client";

import { useRef, useState } from "react";
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
import { generateClientUuid } from "../../lib/client-uuid";
import { createMonthlyExpenseAction } from "../../server/actions/monthly-expenses";

function initialState(): MonthlyExpenseFieldsState {
  return {
    categoryId: "",
    vendorId: "",
    description: "",
    amount: "",
    fundingSource: "BUSINESS",
    fundedByUserId: "",
  };
}

/**
 * FR-MEXP-01/05/08 — Administration/Purchasing line entry for the selected
 * `periodMonth`. Same two-step non-blocking same-category-in-month warning
 * as Counter Income's duplicate-date flow: a first submission that
 * collides with an existing live row in the same category this month shows
 * a confirmation banner rather than a hard rejection; `clientUuid` stays
 * stable across both submissions of the same attempt.
 */
export function MonthlyExpenseDrawer({
  periodMonth,
  categories,
  vendors,
  partners,
}: {
  periodMonth: string;
  categories: CategoryOption[];
  vendors: VendorOption[];
  partners: PartnerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<MonthlyExpenseFieldsState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const clientUuidRef = useRef<string | null>(null);

  function resetForm() {
    setState(initialState());
    setError(null);
    setDuplicateWarning(false);
    clientUuidRef.current = null;
  }

  async function submit(confirmedDuplicate: boolean) {
    clientUuidRef.current ??= generateClientUuid();
    setSubmitting(true);
    setError(null);

    const result = await createMonthlyExpenseAction({
      clientUuid: clientUuidRef.current,
      periodMonth,
      categoryId: state.categoryId,
      vendorId: state.vendorId || undefined,
      description: state.description || undefined,
      amount: state.amount,
      fundingSource: state.fundingSource,
      fundedByUserId: state.fundingSource === "PARTNER" ? state.fundedByUserId : undefined,
      confirmedDuplicate,
    });

    setSubmitting(false);
    if (!result.ok) {
      if ("requiresConfirmation" in result) {
        setDuplicateWarning(true);
        return;
      }
      setError(result.error);
      return;
    }
    setOpen(false);
    resetForm();
    router.refresh();
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <span className="material-symbols-outlined text-[20px]">add</span>
        Add Expense
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Monthly Expense">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
        >
          <MonthlyExpenseFormFields
            idPrefix="monthly-expense"
            state={state}
            onChange={(next) => setState((prev) => ({ ...prev, ...next }))}
            categories={categories}
            vendors={vendors}
            partners={partners}
          />
          {duplicateWarning ? (
            <div className="border-tertiary bg-tertiary-container/10 flex flex-col gap-3 rounded-lg border p-3">
              <p className="text-on-surface text-sm">
                This category already has an entry for {periodMonth}. Record this as an additional
                line for the same category?
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setDuplicateWarning(false)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void submit(true)} disabled={submitting}>
                  Record Anyway
                </Button>
              </div>
            </div>
          ) : null}
          {error ? <p className="text-error text-sm">{error}</p> : null}
          {!duplicateWarning ? (
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save Expense"}
              </Button>
            </div>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
