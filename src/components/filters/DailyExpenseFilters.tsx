"use client";

import { useState } from "react";
import { useFilterNavigation } from "./useFilterNavigation";
import { useSyncedState } from "./useSyncedState";
import { FilterBarShell } from "./FilterBarShell";
import { isValidDateRange } from "../../lib/navigation/filter-query";

/**
 * FR-DEXP-07's filter bar, converted from a plain `<form action>` GET
 * submission to client-side, auto-applying filters (no "Apply Filters"
 * button, no full page reload) — see
 * docs/adr/0012-centered-overlays-and-auto-apply-filters.md.
 */
export function DailyExpenseFilters({
  currentParams,
  from,
  to,
  search,
  fundingSource,
}: {
  currentParams: Record<string, string | undefined>;
  from: string;
  to: string;
  search: string;
  fundingSource: string;
}) {
  const { applyNow, applyDebounced, reset, isPending } = useFilterNavigation(currentParams);
  const [localFrom, setLocalFrom] = useSyncedState(from);
  const [localTo, setLocalTo] = useSyncedState(to);
  const [localSearch, setLocalSearch] = useSyncedState(search);
  const [localFundingSource, setLocalFundingSource] = useSyncedState(fundingSource);
  const [rangeError, setRangeError] = useState(false);

  function handleDateChange(next: { from?: string; to?: string }) {
    const nextFrom = next.from ?? localFrom;
    const nextTo = next.to ?? localTo;
    if (next.from !== undefined) setLocalFrom(next.from);
    if (next.to !== undefined) setLocalTo(next.to);
    if (!isValidDateRange(nextFrom, nextTo)) {
      setRangeError(true);
      return;
    }
    setRangeError(false);
    applyNow({ from: nextFrom, to: nextTo });
  }

  const filtersActive = Boolean(
    currentParams.from || currentParams.to || currentParams.fundingSource || currentParams.search,
  );

  return (
    <FilterBarShell
      isPending={isPending}
      showReset={filtersActive}
      onReset={() => {
        setLocalFrom("");
        setLocalTo("");
        setLocalSearch("");
        setLocalFundingSource("");
        setRangeError(false);
        reset();
      }}
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-from"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          From
        </label>
        <input
          id="filter-from"
          type="date"
          value={localFrom}
          onChange={(event) => handleDateChange({ from: event.target.value })}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-to"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          To
        </label>
        <input
          id="filter-to"
          type="date"
          value={localTo}
          onChange={(event) => handleDateChange({ to: event.target.value })}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        />
      </div>
      {rangeError ? (
        <p role="alert" className="text-error self-end pb-3 text-xs">
          From date must be on or before To date.
        </p>
      ) : null}
      <div className="flex min-w-[200px] flex-1 flex-col gap-2">
        <label
          htmlFor="filter-search"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          Item or Description
        </label>
        <input
          id="filter-search"
          type="text"
          value={localSearch}
          placeholder="Search…"
          onChange={(event) => {
            setLocalSearch(event.target.value);
            applyDebounced({ search: event.target.value });
          }}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-funding-source"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          Funding Source
        </label>
        <select
          id="filter-funding-source"
          value={localFundingSource}
          onChange={(event) => {
            setLocalFundingSource(event.target.value);
            applyNow({ fundingSource: event.target.value });
          }}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        >
          <option value="">All Sources</option>
          <option value="BUSINESS">Business</option>
          <option value="PARTNER">Partner</option>
        </select>
      </div>
    </FilterBarShell>
  );
}
