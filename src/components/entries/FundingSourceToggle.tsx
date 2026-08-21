"use client";

import { Select } from "../ui/Select";

export interface PartnerOption {
  id: string;
  fullName: string;
}

/**
 * FR-DEXP-05/FR-MEXP-05, DR-07 — translated from the Stitch Daily Expenses
 * export's segmented Business/Partner control (`docs/ui/stitch-export/
 * daily_expenses_cdc_laboratories_code.html`), reimplemented as real radio
 * inputs (not the export's inline `onchange="togglePartnerSelector(...)"`
 * script) so the partner selector's reveal/require state is driven by
 * React state, not global DOM functions. Selecting Partner without a
 * partner chosen is caught server-side by the same bidirectional rule as
 * the database CHECK constraint (`createDailyExpenseSchema`'s
 * `superRefine`) — this component only prevents the *obviously* invalid
 * shape (partner selector hidden while `fundedByUserId` non-empty).
 */
export function FundingSourceToggle({
  fundingSource,
  onFundingSourceChange,
  fundedByUserId,
  onFundedByUserIdChange,
  partners,
  name,
}: {
  fundingSource: "BUSINESS" | "PARTNER";
  onFundingSourceChange: (value: "BUSINESS" | "PARTNER") => void;
  fundedByUserId: string;
  onFundedByUserIdChange: (value: string) => void;
  partners: PartnerOption[];
  name: string;
}) {
  return (
    <div className="pt-2">
      <span className="text-on-surface mb-2 block text-sm font-medium">Funding Source</span>
      <div className="border-outline-variant bg-surface-container flex rounded-lg border p-1">
        {(["BUSINESS", "PARTNER"] as const).map((option) => (
          <label key={option} className="relative flex-1 cursor-pointer text-center">
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              checked={fundingSource === option}
              onChange={() => onFundingSourceChange(option)}
            />
            <div className="text-on-surface-variant peer-checked:bg-surface-container-lowest peer-checked:text-primary flex h-9 items-center justify-center rounded-md text-sm font-medium transition-all peer-checked:shadow-sm">
              {option === "BUSINESS" ? "Business" : "Partner"}
            </div>
          </label>
        ))}
      </div>
      {fundingSource === "BUSINESS" ? (
        <p className="text-on-surface-variant mt-2 text-sm">Business-funded reduces profit.</p>
      ) : (
        <p className="text-tertiary mt-2 text-sm">
          Partner-funded increases that partner&apos;s investment. Never repaid in cash.
        </p>
      )}
      {fundingSource === "PARTNER" ? (
        <div className="border-tertiary mt-3 border-l-2 pl-4">
          <Select
            id={`${name}-partner`}
            label="Select Partner"
            value={fundedByUserId}
            onChange={(event) => onFundedByUserIdChange(event.target.value)}
            required
          >
            <option value="" disabled>
              Choose partner&hellip;
            </option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.fullName}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
}
