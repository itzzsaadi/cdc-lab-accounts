"use client";

import { TextInput } from "../ui/TextInput";
import { Select } from "../ui/Select";

export interface PurchasingCategoryOption {
  id: string;
  name: string;
}

export interface AssetVendorOption {
  id: string;
  name: string;
}

export interface AssetPartnerOption {
  id: string;
  fullName: string;
}

export interface AssetFieldsState {
  name: string;
  classification: "FIXED" | "MOVABLE";
  vendorId: string;
  acquiredOn: string;
  acquisitionMode: "INSTALMENT" | "CASH";
  monthlyInstalment: string;
  defaultCategoryId: string;
  purchasePrice: string;
  purchasedByUserId: string;
}

/**
 * FR-AST-02/06/07, DR-08 — approved decision 2b: the Cash-mode purchasing
 * partner is part of the same required field as the mode itself, never an
 * independent optional checkbox (UI_REQUIREMENTS.md §10/§25). Instalment
 * mode requires a positive monthly instalment and an active Purchasing
 * default category (FR-AST-04); Cash mode requires a positive purchase
 * price and an eligible partner (FR-AST-06). Shared by create
 * (`AssetDrawer`) and edit (`AssetRowActions`).
 */
export function AssetFormFields({
  idPrefix,
  state,
  onChange,
  purchasingCategories,
  vendors,
  partners,
}: {
  idPrefix: string;
  state: AssetFieldsState;
  onChange: (next: Partial<AssetFieldsState>) => void;
  purchasingCategories: PurchasingCategoryOption[];
  vendors: AssetVendorOption[];
  partners: AssetPartnerOption[];
}) {
  return (
    <>
      <TextInput
        id={`${idPrefix}-name`}
        label="Asset Name"
        value={state.name}
        onChange={(event) => onChange({ name: event.target.value })}
        required
      />
      <Select
        id={`${idPrefix}-classification`}
        label="Classification"
        value={state.classification}
        onChange={(event) =>
          onChange({ classification: event.target.value as "FIXED" | "MOVABLE" })
        }
      >
        <option value="FIXED">Fixed</option>
        <option value="MOVABLE">Movable</option>
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
        id={`${idPrefix}-acquired-on`}
        label="Date Acquired (optional)"
        type="date"
        value={state.acquiredOn}
        onChange={(event) => onChange({ acquiredOn: event.target.value })}
      />

      <div className="pt-2">
        <span className="text-on-surface mb-2 block text-sm font-medium">Acquisition Mode</span>
        <div className="border-outline-variant bg-surface-container flex rounded-lg border p-1">
          {(["INSTALMENT", "CASH"] as const).map((option) => (
            <label key={option} className="relative flex-1 cursor-pointer text-center">
              <input
                type="radio"
                name={`${idPrefix}-acquisition-mode`}
                className="peer sr-only"
                checked={state.acquisitionMode === option}
                onChange={() => onChange({ acquisitionMode: option })}
              />
              <div className="text-on-surface-variant peer-checked:bg-surface-container-lowest peer-checked:text-primary flex h-9 items-center justify-center rounded-md text-sm font-medium transition-all peer-checked:shadow-sm">
                {option === "INSTALMENT" ? "Instalment" : "Cash"}
              </div>
            </label>
          ))}
        </div>
      </div>

      {state.acquisitionMode === "INSTALMENT" ? (
        <>
          <TextInput
            id={`${idPrefix}-monthly-instalment`}
            label="Monthly Instalment (PKR)"
            inputMode="decimal"
            value={state.monthlyInstalment}
            onChange={(event) =>
              onChange({ monthlyInstalment: event.target.value.replace(/[^0-9.]/g, "") })
            }
            placeholder="0.00"
            required
          />
          <Select
            id={`${idPrefix}-default-category`}
            label="Default Expense Category"
            value={state.defaultCategoryId}
            onChange={(event) => onChange({ defaultCategoryId: event.target.value })}
            required
          >
            <option value="" disabled>
              Choose category&hellip;
            </option>
            {purchasingCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </>
      ) : (
        <>
          <TextInput
            id={`${idPrefix}-purchase-price`}
            label="Purchase Price (PKR)"
            inputMode="decimal"
            value={state.purchasePrice}
            onChange={(event) =>
              onChange({ purchasePrice: event.target.value.replace(/[^0-9.]/g, "") })
            }
            placeholder="0.00"
            required
          />
          <Select
            id={`${idPrefix}-purchased-by`}
            label="Purchasing Partner"
            value={state.purchasedByUserId}
            onChange={(event) => onChange({ purchasedByUserId: event.target.value })}
            required
          >
            <option value="" disabled>
              Choose partner&hellip;
            </option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
        </>
      )}
    </>
  );
}
