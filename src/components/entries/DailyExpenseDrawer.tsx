"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { Select } from "../ui/Select";
import { FundingSourceToggle, type PartnerOption } from "./FundingSourceToggle";
import { generateClientUuid } from "../../lib/client-uuid";
import { todayInKarachi } from "../../lib/domain/calendar-date";
import { createDailyExpenseAction } from "../../server/actions/daily-expenses";

export interface ExpenseItemOption {
  id: string;
  name: string;
}

const OTHER_VALUE = "__other__";

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
  const [open, setOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState(() => todayInKarachi());
  const [itemSelection, setItemSelection] = useState<string>(
    () => expenseItems[0]?.id ?? OTHER_VALUE,
  );
  const [customDescription, setCustomDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [fundingSource, setFundingSource] = useState<"BUSINESS" | "PARTNER">("BUSINESS");
  const [fundedByUserId, setFundedByUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const clientUuidRef = useRef<string | null>(null);

  function resetForm() {
    setExpenseDate(todayInKarachi());
    setItemSelection(expenseItems[0]?.id ?? OTHER_VALUE);
    setCustomDescription("");
    setAmount("");
    setFundingSource("BUSINESS");
    setFundedByUserId("");
    setError(null);
    clientUuidRef.current = null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    clientUuidRef.current ??= generateClientUuid();

    const result = await createDailyExpenseAction({
      clientUuid: clientUuidRef.current,
      expenseDate,
      expenseItemId: itemSelection === OTHER_VALUE ? undefined : itemSelection,
      customDescription: itemSelection === OTHER_VALUE ? customDescription : undefined,
      amount,
      fundingSource,
      fundedByUserId: fundingSource === "PARTNER" ? fundedByUserId : undefined,
    });

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
      <Button type="button" onClick={() => setOpen(true)}>
        <span className="material-symbols-outlined text-[20px]">add</span>
        Add Expense
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Expense">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            setSubmitting(true);
            void handleSubmit(event);
          }}
        >
          <TextInput
            id="expense-date"
            label="Date"
            type="date"
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
            required
          />
          <Select
            id="expense-item"
            label="Item"
            value={itemSelection}
            onChange={(event) => setItemSelection(event.target.value)}
          >
            {expenseItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value={OTHER_VALUE}>Other (type below)</option>
          </Select>
          {itemSelection === OTHER_VALUE ? (
            <TextInput
              id="expense-custom-description"
              label="Description"
              value={customDescription}
              onChange={(event) => setCustomDescription(event.target.value)}
              placeholder="Describe the expense…"
              required
            />
          ) : null}
          <TextInput
            id="expense-amount"
            label="Amount (PKR)"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            required
          />
          <FundingSourceToggle
            name="expense-funding-source"
            fundingSource={fundingSource}
            onFundingSourceChange={setFundingSource}
            fundedByUserId={fundedByUserId}
            onFundedByUserIdChange={setFundedByUserId}
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
