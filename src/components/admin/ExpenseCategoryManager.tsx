"use client";

import { useState } from "react";
import { MasterDataManager, type MasterDataRow } from "./MasterDataManager";
import { Select } from "../ui/Select";
import { Checkbox } from "../ui/Checkbox";
import {
  createExpenseCategoryAction,
  updateExpenseCategoryAction,
  archiveOrReactivateExpenseCategoryAction,
} from "../../server/actions/master-data";

/** FR-MST-03. `expenseGroup` is immutable after creation; `isRecurring` is explicitly editable (FR-MST-03's own wording). */
export function ExpenseCategoryManager({ rows }: { rows: MasterDataRow[] }) {
  const [expenseGroup, setExpenseGroup] = useState<"ADMIN" | "PURCHASING">("ADMIN");
  const [isRecurring, setIsRecurring] = useState(false);

  return (
    <MasterDataManager
      entityLabel="Expense Categories"
      itemLabel="Expense Category"
      rows={rows}
      onCreate={(name) => createExpenseCategoryAction({ name, expenseGroup, isRecurring })}
      onUpdate={(id, name, expectedUpdatedAt) =>
        updateExpenseCategoryAction({ id, name, isRecurring, expectedUpdatedAt })
      }
      onArchiveOrReactivate={(id, isActive, expectedUpdatedAt) =>
        archiveOrReactivateExpenseCategoryAction({ id, isActive, expectedUpdatedAt })
      }
      extraFields={(editing) => {
        const recurringValue = editing ? Boolean(editing.extra?.isRecurring) : isRecurring;
        return (
          <>
            {!editing ? (
              <Select
                id="category-expense-group"
                label="Group"
                value={expenseGroup}
                onChange={(e) => setExpenseGroup(e.target.value as "ADMIN" | "PURCHASING")}
              >
                <option value="ADMIN">Administration</option>
                <option value="PURCHASING">Purchasing</option>
              </Select>
            ) : (
              <p className="text-on-surface-variant text-xs">
                Group: {editing.extra?.expenseGroup === "ADMIN" ? "Administration" : "Purchasing"}{" "}
                (cannot be changed after creation)
              </p>
            )}
            <Checkbox
              id="category-is-recurring"
              label="Expected every month (recurring)"
              checked={recurringValue}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
          </>
        );
      }}
    />
  );
}
