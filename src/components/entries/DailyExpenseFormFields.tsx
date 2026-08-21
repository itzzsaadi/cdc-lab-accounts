"use client";

import { TextInput } from "../ui/TextInput";
import { Select } from "../ui/Select";
import { FundingSourceToggle, type PartnerOption } from "./FundingSourceToggle";

export interface ExpenseItemOption {
  id: string;
  name: string;
}

export const OTHER_VALUE = "__other__";

export interface DailyExpenseFieldsState {
  expenseDate: string;
  itemSelection: string;
  customDescription: string;
  amount: string;
  fundingSource: "BUSINESS" | "PARTNER";
  fundedByUserId: string;
}

/**
 * The five Daily Expense fields (date/item-or-description/amount/funding
 * source), shared between the create drawer and the edit modal — same
 * fields, same validation shape, so a change to one never silently drifts
 * from the other. Purely presentational: the parent owns all state and
 * the submit handler.
 */
export function DailyExpenseFormFields({
  idPrefix,
  state,
  onChange,
  expenseItems,
  partners,
}: {
  idPrefix: string;
  state: DailyExpenseFieldsState;
  onChange: (next: Partial<DailyExpenseFieldsState>) => void;
  expenseItems: ExpenseItemOption[];
  partners: PartnerOption[];
}) {
  return (
    <>
      <TextInput
        id={`${idPrefix}-date`}
        label="Date"
        type="date"
        value={state.expenseDate}
        onChange={(event) => onChange({ expenseDate: event.target.value })}
        required
      />
      <Select
        id={`${idPrefix}-item`}
        label="Item"
        value={state.itemSelection}
        onChange={(event) => onChange({ itemSelection: event.target.value })}
      >
        {expenseItems.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
        <option value={OTHER_VALUE}>Other (type below)</option>
      </Select>
      {state.itemSelection === OTHER_VALUE ? (
        <TextInput
          id={`${idPrefix}-custom-description`}
          label="Description"
          value={state.customDescription}
          onChange={(event) => onChange({ customDescription: event.target.value })}
          placeholder="Describe the expense…"
          required
        />
      ) : null}
      <TextInput
        id={`${idPrefix}-amount`}
        label="Amount (PKR)"
        inputMode="decimal"
        value={state.amount}
        onChange={(event) => onChange({ amount: event.target.value.replace(/[^0-9.]/g, "") })}
        placeholder="0.00"
        required
      />
      <FundingSourceToggle
        name={`${idPrefix}-funding-source`}
        fundingSource={state.fundingSource}
        onFundingSourceChange={(fundingSource) => onChange({ fundingSource })}
        fundedByUserId={state.fundedByUserId}
        onFundedByUserIdChange={(fundedByUserId) => onChange({ fundedByUserId })}
        partners={partners}
      />
    </>
  );
}
