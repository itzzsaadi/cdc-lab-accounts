"use client";

import { useFilterNavigation } from "./useFilterNavigation";
import { useSyncedState } from "./useSyncedState";

/**
 * A reusable auto-apply month picker (`<input type="month">`).
 * Replaces the old `<form action> + Go button` pattern on any page
 * that filters by a single YYYY-MM month param.
 *
 * Renders a bare label + input — no FilterBarShell wrapper — so it can
 * sit inline inside a page header row alongside other action buttons.
 */
export function MonthFilter({
  currentParams,
  month,
  paramName = "month",
  label = "Month",
  inputId = "filter-month",
}: {
  /** The already-parsed query object from the Server Component (e.g. `{ month: "2026-09" }`). */
  currentParams: Record<string, string | undefined>;
  /** The resolved month value that was actually used to render the page. */
  month: string;
  /** The URL search-param key to write (default: "month"). */
  paramName?: string;
  /** The visible label text (default: "Month"). */
  label?: string;
  /** The `id` for the `<input>` (default: "filter-month"). */
  inputId?: string;
}) {
  const { applyNow, isPending } = useFilterNavigation(currentParams);
  const [localMonth, setLocalMonth] = useSyncedState(month);

  return (
    <div className="flex items-center gap-3">
      <label htmlFor={inputId} className="text-on-surface-variant text-sm">
        {label}
      </label>
      <input
        id={inputId}
        type="month"
        value={localMonth}
        onChange={(event) => {
          setLocalMonth(event.target.value);
          if (event.target.value) {
            applyNow({ [paramName]: event.target.value });
          }
        }}
        className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
      />
      {isPending ? (
        <span
          role="status"
          aria-live="polite"
          className="text-on-surface-variant flex items-center gap-1 text-xs"
        >
          <span className="material-symbols-outlined animate-spin text-[16px]" aria-hidden>
            progress_activity
          </span>
          Updating…
        </span>
      ) : null}
    </div>
  );
}
