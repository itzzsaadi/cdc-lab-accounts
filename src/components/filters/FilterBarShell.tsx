"use client";

/**
 * The bordered card shell every filter bar renders inside — shared so
 * "Reset Filters" and the subtle in-flight indicator look and behave
 * identically on every filterable screen, rather than being re-authored
 * per page.
 */
export function FilterBarShell({
  children,
  onReset,
  showReset,
  isPending,
}: {
  children: React.ReactNode;
  onReset: () => void;
  showReset: boolean;
  isPending: boolean;
}) {
  return (
    <div className="border-outline-variant bg-surface-container-lowest mb-6 flex flex-wrap items-end gap-4 rounded-xl border p-4 shadow-sm">
      {children}
      <div className="flex items-center gap-3">
        {showReset ? (
          <button
            type="button"
            onClick={onReset}
            className="border-outline-variant text-on-surface hover:bg-surface-container flex h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
          >
            Reset Filters
          </button>
        ) : null}
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
    </div>
  );
}
