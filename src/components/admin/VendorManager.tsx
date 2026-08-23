"use client";

import { MasterDataManager, type MasterDataRow } from "./MasterDataManager";
import {
  createVendorAction,
  updateVendorAction,
  archiveOrReactivateVendorAction,
} from "../../server/actions/master-data";

export function VendorManager({ rows }: { rows: MasterDataRow[] }) {
  return (
    <MasterDataManager
      entityLabel="Vendors"
      itemLabel="Vendor"
      rows={rows}
      onCreate={(name) => createVendorAction({ name })}
      onUpdate={(id, name, expectedUpdatedAt) =>
        updateVendorAction({ id, name, expectedUpdatedAt })
      }
      onArchiveOrReactivate={(id, isActive, expectedUpdatedAt) =>
        archiveOrReactivateVendorAction({ id, isActive, expectedUpdatedAt })
      }
    />
  );
}
