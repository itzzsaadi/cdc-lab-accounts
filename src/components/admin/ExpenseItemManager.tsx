"use client";

import { MasterDataManager, type MasterDataRow } from "./MasterDataManager";
import {
  createExpenseItemAction,
  updateExpenseItemAction,
  archiveOrReactivateExpenseItemAction,
} from "../../server/actions/master-data";

export function ExpenseItemManager({ rows }: { rows: MasterDataRow[] }) {
  return (
    <MasterDataManager
      entityLabel="Expense Items"
      itemLabel="Expense Item"
      rows={rows}
      onCreate={(name) => createExpenseItemAction({ name })}
      onUpdate={(id, name, expectedUpdatedAt) =>
        updateExpenseItemAction({ id, name, expectedUpdatedAt })
      }
      onArchiveOrReactivate={(id, isActive, expectedUpdatedAt) =>
        archiveOrReactivateExpenseItemAction({ id, isActive, expectedUpdatedAt })
      }
    />
  );
}
