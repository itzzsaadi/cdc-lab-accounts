"use client";

import { useState } from "react";
import { useFilterNavigation } from "./useFilterNavigation";
import { useSyncedState } from "./useSyncedState";
import { FilterBarShell } from "./FilterBarShell";
import { isValidDateRange } from "../../lib/navigation/filter-query";

/**
 * A reusable auto-apply From/To date range filter bar.
 * Replaces the old `<form action> + Apply Range button` pattern on
 * report pages (Party Income Report, Monthly Summary).
 *
 * Fires a navigation as soon as the user picks a valid, consistent pair —
 * i.e. as soon as `from <= to` holds — without requiring any button click.
 * An inline error is shown (and navigation is suppressed) when `from > to`.
 */
export function DateRangeFilter({
  currentParams,
  from,
  to,
}: {
  /** The already-parsed query object from the Server Component. */
  currentParams: Record<string, string | undefined>;
  /** The resolved "from" date (YYYY-MM-DD) actually used to render the page. */
  from: string;
  /** The resolved "to" date (YYYY-MM-DD) actually used to render the page. */
  to: string;
}) {
  const { applyNow, reset, isPending } = useFilterNavigation(currentParams);
  const [localFrom, setLocalFrom] = useSyncedState(from);
  const [localTo, setLocalTo] = useSyncedState(to);
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
    // Only navigate when both fields are filled
    if (nextFrom && nextTo) {
      applyNow({ from: nextFrom, to: nextTo });
    }
  }

  const filtersActive = Boolean(currentParams.from || currentParams.to);

  return (
    <FilterBarShell
      isPending={isPending}
      showReset={filtersActive}
      onReset={() => {
        setLocalFrom("");
        setLocalTo("");
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
    </FilterBarShell>
  );
}
