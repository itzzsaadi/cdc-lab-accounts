"use client";

import { useState } from "react";
import { MasterDataManager, type MasterDataRow } from "./MasterDataManager";
import { Select } from "../ui/Select";
import { TextInput } from "../ui/TextInput";
import { InfoTip } from "../ui/InfoTip";
import {
  createPartyAction,
  updatePartyAction,
  archiveOrReactivatePartyAction,
} from "../../server/actions/master-data";

/** FR-MST-01. `billingMode` is immutable after creation (see lib/validation/master-data.ts) — the field only appears when creating, never when renaming. `sortOrder` is always editable. */
export function PartyManager({ rows }: { rows: MasterDataRow[] }) {
  const [billingMode, setBillingMode] = useState<"DAILY" | "MONTHLY">("DAILY");
  const [sortOrder, setSortOrder] = useState("1");

  return (
    <MasterDataManager
      entityLabel="Parties"
      itemLabel="Party"
      rows={rows}
      onCreate={(name) => createPartyAction({ name, billingMode, sortOrder: Number(sortOrder) })}
      onUpdate={(id, name, expectedUpdatedAt) =>
        updatePartyAction({ id, name, sortOrder: Number(sortOrder), expectedUpdatedAt })
      }
      onArchiveOrReactivate={(id, isActive, expectedUpdatedAt) =>
        archiveOrReactivatePartyAction({ id, isActive, expectedUpdatedAt })
      }
      extraFields={(editing) => {
        const sortOrderValue = editing ? String(editing.extra?.sortOrder ?? sortOrder) : sortOrder;
        return (
          <>
            {!editing ? (
              <Select
                id="party-billing-mode"
                label={
                  <>
                    Billing Mode{" "}
                    <InfoTip>
                      Cannot be changed once created. Daily means the party gets a column in the
                      daily income grid. Monthly means a single consolidated bill.
                    </InfoTip>
                  </>
                }
                value={billingMode}
                onChange={(e) => setBillingMode(e.target.value as "DAILY" | "MONTHLY")}
              >
                <option value="DAILY">Daily-billing</option>
                <option value="MONTHLY">Monthly-billing</option>
              </Select>
            ) : (
              <p className="text-on-surface-variant text-xs">
                Billing mode:{" "}
                {editing.extra?.billingMode === "DAILY" ? "Daily-billing" : "Monthly-billing"}{" "}
                (cannot be changed after creation)
              </p>
            )}
            <TextInput
              id="party-sort-order"
              label={
                <>
                  Sort Order{" "}
                  <InfoTip>Lower numbers appear further left in the daily income grid.</InfoTip>
                </>
              }
              type="number"
              min={0}
              value={sortOrderValue}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </>
        );
      }}
    />
  );
}
