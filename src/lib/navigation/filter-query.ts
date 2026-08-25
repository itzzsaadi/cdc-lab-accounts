/**
 * Pure query-string helpers behind the auto-apply filter bars
 * (`src/components/filters/*`), separated out so the merge/validation
 * logic itself is unit-testable without a browser or a `next/navigation`
 * router.
 */

/**
 * Merges `updates` into `current`, dropping any key whose new value is
 * empty/undefined, and preserving every other existing param untouched
 * (e.g. a screen-specific param this filter bar doesn't itself own).
 * `cursor` (keyset pagination's page marker) is dropped whenever a filter
 * changes unless the caller explicitly says otherwise, since a new filter
 * always means "start over from page one."
 */
export function mergeFilterParams(
  current: Record<string, string | undefined>,
  updates: Record<string, string | undefined>,
  options: { keepCursor?: boolean } = {},
): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  if (!options.keepCursor) next.delete("cursor");
  return next;
}

/**
 * A "From"/"To" date pair is only sent as a request when it's actually
 * complete-and-consistent: either bound may be empty (an open-ended
 * range), but if both are present, `from` must not be after `to`. This is
 * what "prevent requests for incomplete or invalid date ranges" means in
 * practice — the browser's own `<input type="date">` only ever fires
 * `change` with a fully-formed date, so "incomplete" here is really about
 * the *pair* (from > to), not a half-typed single field.
 */
export function isValidDateRange(from: string | undefined, to: string | undefined): boolean {
  if (!from || !to) return true;
  return from <= to;
}
