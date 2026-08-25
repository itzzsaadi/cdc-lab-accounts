"use client";

import { useFilterNavigation } from "./useFilterNavigation";
import { useSyncedState } from "./useSyncedState";
import { FilterBarShell } from "./FilterBarShell";

/** FR-AST filter bar — status/classification/acquisition mode, all select-only, so every change applies immediately with no debounce needed. */
export function AssetFilters({
  currentParams,
  status,
  classification,
  acquisitionMode,
}: {
  currentParams: Record<string, string | undefined>;
  status: string;
  classification: string;
  acquisitionMode: string;
}) {
  const { applyNow, reset, isPending } = useFilterNavigation(currentParams);
  const [localStatus, setLocalStatus] = useSyncedState(status);
  const [localClassification, setLocalClassification] = useSyncedState(classification);
  const [localAcquisitionMode, setLocalAcquisitionMode] = useSyncedState(acquisitionMode);

  const filtersActive = Boolean(
    currentParams.classification || currentParams.acquisitionMode || currentParams.status,
  );

  return (
    <FilterBarShell
      isPending={isPending}
      showReset={filtersActive}
      onReset={() => {
        setLocalStatus("ACTIVE");
        setLocalClassification("");
        setLocalAcquisitionMode("");
        reset();
      }}
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-status"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          Status
        </label>
        <select
          id="filter-status"
          value={localStatus}
          onChange={(event) => {
            setLocalStatus(event.target.value);
            applyNow({ status: event.target.value });
          }}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        >
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-classification"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          Classification
        </label>
        <select
          id="filter-classification"
          value={localClassification}
          onChange={(event) => {
            setLocalClassification(event.target.value);
            applyNow({ classification: event.target.value });
          }}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        >
          <option value="">All</option>
          <option value="FIXED">Fixed</option>
          <option value="MOVABLE">Movable</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-mode"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          Acquisition Mode
        </label>
        <select
          id="filter-mode"
          value={localAcquisitionMode}
          onChange={(event) => {
            setLocalAcquisitionMode(event.target.value);
            applyNow({ acquisitionMode: event.target.value });
          }}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        >
          <option value="">All</option>
          <option value="INSTALMENT">Instalment</option>
          <option value="CASH">Cash</option>
        </select>
      </div>
    </FilterBarShell>
  );
}
