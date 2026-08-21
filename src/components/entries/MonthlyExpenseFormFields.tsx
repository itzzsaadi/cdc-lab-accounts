"use client";

import { TextInput } from "../ui/TextInput";
import { Select } from "../ui/Select";
import { FundingSourceToggle, type PartnerOption } from "./FundingSourceToggle";

export interface CategoryOption {
  id: string;
  name: string;
  expenseGroup: "ADMIN" | "PURCHASING";
}

export interface VendorOption {
  id: string;
  name: string;
}

export interface MonthlyExpenseFieldsState {
  categoryId: string;
  vendorId: string;
  description: string;
  amount: string;
  fundingSource: "BUSINESS" | "PARTNER";
  fundedByUserId: string;
}

/** FR-MEXP-01/02/05 — one category (Admin or Purchasing) plus an optional vendor and free-text description; shared by create (`MonthlyExpenseDrawer`) and edit (`MonthlyExpenseRowActions`) flows, mirroring `DailyExpenseFormFields`'s extraction. */
export function MonthlyExpenseFormFields({
  idPrefix,
  state,
  onChange,
  categories,
  vendors,
  partners,
}: {
  idPrefix: string;
  state: MonthlyExpenseFieldsState;
  onChange: (next: Partial<MonthlyExpenseFieldsState>) => void;
  categories: CategoryOption[];
  vendors: VendorOption[];
  partners: PartnerOption[];
}) {
  return (
    <>
      <Select
        id={`${idPrefix}-category`}
        label="Category"
        value={state.categoryId}
        onChange={(event) => onChange({ categoryId: event.target.value })}
        required
      >
        <option value="" disabled>
          Choose category&hellip;
        </option>
        <optgroup label="Administration">
          {categories
            .filter((c) => c.expenseGroup === "ADMIN")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
        <optgroup label="Purchasing">
          {categories
            .filter((c) => c.expenseGroup === "PURCHASING")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      </Select>
      <Select
        id={`${idPrefix}-vendor`}
        label="Vendor (optional)"
        value={state.vendorId}
        onChange={(event) => onChange({ vendorId: event.target.value })}
      >
        <option value="">None</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Select>
      <TextInput
        id={`${idPrefix}-description`}
        label="Description (optional)"
        value={state.description}
        onChange={(event) => onChange({ description: event.target.value })}
      />
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
        onFundingSourceChange={(value) => onChange({ fundingSource: value })}
        fundedByUserId={state.fundedByUserId}
        onFundedByUserIdChange={(value) => onChange({ fundedByUserId: value })}
        partners={partners}
      />
    </>
  );
}
