"use client";

import { useRef, useState } from "react";
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
import { generateClientUuid } from "../../lib/client-uuid";
import { todayInKarachi } from "../../lib/domain/calendar-date";
import { createDailyExpenseAction } from "../../server/actions/daily-expenses";
import { useOfflineSync } from "../offline/OfflineProvider";
import { isLikelyOfflineError } from "../../lib/offline/submit-helpers";

export type { ExpenseItemOption };

function initialState(expenseItems: ExpenseItemOption[]): DailyExpenseFieldsState {
  return {
    expenseDate: todayInKarachi(),
    itemSelection: expenseItems[0]?.id ?? OTHER_VALUE,
    customDescription: "",
    amount: "",
    fundingSource: "BUSINESS",
    fundedByUserId: "",
  };
}

/**
 * FR-DEXP-01/02/05/06 — translated from the Stitch export's "Add Expense"
 * drawer (`daily_expenses_cdc_laboratories_code.html`), reimplemented as a
 * native `<dialog>`-backed `Modal` (approved Phase 3A pattern) rather than
 * the export's manually-toggled overlay `<div>`. The export's separate
 * "Notes (Optional)" textarea is dropped — `daily_expenses` has no such
 * column (only `expense_item_id` XOR `custom_description`), so a Notes
 * field would have nowhere to be stored.
 */
export function DailyExpenseDrawer({
  expenseItems,
  partners,
}: {
  expenseItems: ExpenseItemOption[];
  partners: PartnerOption[];
}) {
  const router = useRouter();
  const { enqueue } = useOfflineSync();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DailyExpenseFieldsState>(() => initialState(expenseItems));
  const [error, setError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const clientUuidRef = useRef<string | null>(null);

  function resetForm() {
    setState(initialState(expenseItems));
    setError(null);
    clientUuidRef.current = null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setOfflineNotice(null);
    clientUuidRef.current ??= generateClientUuid();
    const clientUuid = clientUuidRef.current;
    const payload = {
      clientUuid,
      expenseDate: state.expenseDate,
      expenseItemId: state.itemSelection === OTHER_VALUE ? undefined : state.itemSelection,
      customDescription: state.itemSelection === OTHER_VALUE ? state.customDescription : undefined,
      amount: state.amount,
      fundingSource: state.fundingSource,
      fundedByUserId: state.fundingSource === "PARTNER" ? state.fundedByUserId : undefined,
    };

    let result;
    try {
      result = await createDailyExpenseAction(payload);
    } catch (submitError) {
      setSubmitting(false);
      if (!isLikelyOfflineError(submitError)) {
        setError("Something went wrong. Please try again.");
        return;
      }
      await enqueue({
        operationId: crypto.randomUUID(),
        entityType: "daily_expense",
        action: "CREATE",
        clientUuid,
        payload: { ...payload, capturedAt: new Date().toISOString() },
      });
      setOpen(false);
      resetForm();
      setOfflineNotice("Saved offline — will sync automatically once you're back online.");
      return;
    }

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    resetForm();
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => setOpen(true)}>
          <span className="material-symbols-outlined text-[20px]">add</span>
          Add Expense
        </Button>
        {offlineNotice ? <p className="text-tertiary text-sm">{offlineNotice}</p> : null}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Expense">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            setSubmitting(true);
            void handleSubmit(event);
          }}
        >
          <DailyExpenseFormFields
            idPrefix="expense"
            state={state}
            onChange={(next) => setState((prev) => ({ ...prev, ...next }))}
            expenseItems={expenseItems}
            partners={partners}
          />
          {error ? <p className="text-error text-sm">{error}</p> : null}
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
        </form>
      </Modal>
    </>
  );
}
