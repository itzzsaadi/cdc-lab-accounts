"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import {
  AssetFormFields,
  type AssetFieldsState,
  type PurchasingCategoryOption,
  type AssetVendorOption,
  type AssetPartnerOption,
} from "./AssetFormFields";
import { updateAssetAction, archiveAssetAction } from "../../server/actions/assets";

export interface AssetRow {
  id: string;
  name: string;
  classification: "FIXED" | "MOVABLE";
  vendorId: string | null;
  acquiredOn: string | null;
  acquisitionMode: "INSTALMENT" | "CASH";
  monthlyInstalment: string | null;
  defaultCategoryId: string | null;
  purchasePrice: string | null;
  purchasedByUserId: string | null;
  updatedAt: string;
  status: "ACTIVE" | "ARCHIVED";
  displayLabel: string;
}

/** FR-AST-08: editable/archivable any time; archiving stops future instalment-line generation only (never alters an already-recorded month). Same atomic conditional-write shape as every other entity's row actions. */
export function AssetRowActions({
  asset,
  purchasingCategories,
  vendors,
  partners,
}: {
  asset: AssetRow;
  purchasingCategories: PurchasingCategoryOption[];
  vendors: AssetVendorOption[];
  partners: AssetPartnerOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "edit" | "archive">("none");
  const [state, setState] = useState<AssetFieldsState>(() => ({
    name: asset.name,
    classification: asset.classification,
    vendorId: asset.vendorId ?? "",
    acquiredOn: asset.acquiredOn ?? "",
    acquisitionMode: asset.acquisitionMode,
    monthlyInstalment: asset.monthlyInstalment ?? "",
    defaultCategoryId: asset.defaultCategoryId ?? "",
    purchasePrice: asset.purchasePrice ?? "",
    purchasedByUserId: asset.purchasedByUserId ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStale(false);

    const base = {
      id: asset.id,
      expectedUpdatedAt: asset.updatedAt,
      name: state.name,
      classification: state.classification,
      vendorId: state.vendorId || undefined,
      acquiredOn: state.acquiredOn || undefined,
    };
    const result = await updateAssetAction(
      state.acquisitionMode === "INSTALMENT"
        ? {
            ...base,
            acquisitionMode: "INSTALMENT",
            monthlyInstalment: state.monthlyInstalment,
            defaultCategoryId: state.defaultCategoryId,
          }
        : {
            ...base,
            acquisitionMode: "CASH",
            purchasePrice: state.purchasePrice,
            purchasedByUserId: state.purchasedByUserId,
          },
    );

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      setStale(true);
      return;
    }
    setMode("none");
    router.refresh();
  }

  async function handleArchiveConfirm() {
    setSubmitting(true);
    setError(null);
    setStale(false);

    const result = await archiveAssetAction({ id: asset.id, expectedUpdatedAt: asset.updatedAt });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      setStale(true);
      return;
    }
    setMode("none");
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setMode("edit")}
          disabled={asset.status === "ARCHIVED"}
          className="text-on-surface-variant hover:text-primary hover:bg-surface-container disabled:opacity-40 rounded p-1 transition-colors"
          aria-label={`Edit ${asset.displayLabel}`}
        >
          <span className="material-symbols-outlined text-[20px]">edit</span>
        </button>
        {asset.status === "ACTIVE" ? (
          <button
            type="button"
            onClick={() => setMode("archive")}
            className="text-on-surface-variant hover:text-error hover:bg-surface-container rounded p-1 transition-colors"
            aria-label={`Archive ${asset.displayLabel}`}
          >
            <span className="material-symbols-outlined text-[20px]">archive</span>
          </button>
        ) : null}
      </div>

      <Modal open={mode === "edit"} onClose={() => setMode("none")} title="Edit Asset">
        <form className="flex flex-col gap-5" onSubmit={(event) => void handleEditSubmit(event)}>
          <AssetFormFields
            idPrefix={`asset-edit-${asset.id}`}
            state={state}
            onChange={(next) => setState((prev) => ({ ...prev, ...next }))}
            purchasingCategories={purchasingCategories}
            vendors={vendors}
            partners={partners}
          />
          {error ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-error text-sm">{error}</p>
              {stale ? (
                <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                  Reload
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setMode("none")}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={mode === "archive"} onClose={() => setMode("none")} title="Archive Asset">
        <div className="flex flex-col gap-5">
          <p className="text-on-surface text-sm">
            Archive <span className="font-medium">{asset.displayLabel}</span>? Future
            instalment-line generation stops; already-recorded months are never altered.
          </p>
          {error ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-error text-sm">{error}</p>
              {stale ? (
                <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                  Reload
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setMode("none")}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive-ghost"
              disabled={submitting}
              onClick={() => void handleArchiveConfirm()}
            >
              {submitting ? "Archiving…" : "Archive"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
