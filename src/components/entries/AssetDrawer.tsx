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
import { createAssetAction } from "../../server/actions/assets";

function initialState(): AssetFieldsState {
  return {
    name: "",
    classification: "FIXED",
    vendorId: "",
    acquiredOn: "",
    acquisitionMode: "INSTALMENT",
    monthlyInstalment: "",
    defaultCategoryId: "",
    purchasePrice: "",
    purchasedByUserId: "",
  };
}

/** FR-AST-01/02 — the register starts empty; assets are added over time via this form. No `client_uuid` (assets is not offline-enterable, ADR-0002 decision 7) — the submit button disables while pending to guard against a double click. */
export function AssetDrawer({
  purchasingCategories,
  vendors,
  partners,
}: {
  purchasingCategories: PurchasingCategoryOption[];
  vendors: AssetVendorOption[];
  partners: AssetPartnerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AssetFieldsState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setState(initialState());
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const base = {
      name: state.name,
      classification: state.classification,
      vendorId: state.vendorId || undefined,
      acquiredOn: state.acquiredOn || undefined,
    };
    const result = await createAssetAction(
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
        Add Asset
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Asset">
        <form className="flex flex-col gap-5" onSubmit={(event) => void handleSubmit(event)}>
          <AssetFormFields
            idPrefix="asset"
            state={state}
            onChange={(next) => setState((prev) => ({ ...prev, ...next }))}
            purchasingCategories={purchasingCategories}
            vendors={vendors}
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
              {submitting ? "Saving…" : "Save Asset"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
