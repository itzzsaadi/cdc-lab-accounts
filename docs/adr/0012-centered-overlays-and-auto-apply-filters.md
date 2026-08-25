# ADR-0012: Centered Overlays, Deduplicated History, and Auto-Applying Filters

## Status

Accepted.

## Context

Five cross-application UI issues were reported from live screenshots: every
add/edit/history/confirmation overlay rendered pinned to the top-left of
the viewport instead of centered; the History card showed some field
values twice; the Edit Expense form's labels/values appeared
right-aligned where the Add form's did not; reloading or applying a filter
sometimes triggered the browser's native "Leave site?" prompt; and every
filterable screen required an explicit "Apply Filters" button click after
a full-page `<form>` GET submission.

## Root causes (each verified directly, not assumed)

1. **Off-center overlays** — `src/components/ui/Modal.tsx`'s `<dialog>`
   had no explicit centering classes, relying on the UA stylesheet's
   `dialog:modal { margin: auto }` default. Tailwind's Preflight reset
   (`*, ::before, ::after { margin: 0 }`) overrides that default, and even
   without Preflight the UA rule alone only ever centered vertically —
   horizontal centering was never guaranteed by the browser default in
   the first place.
2. **Duplicated History values** — `HistoryButton.tsx`'s `ValueDiff`
   rendered a field's `after` value twice for a newly-created record: once
   via the intended `{after !== undefined && changed ? <span>{after}</span> : null}`
   branch, and again via a redundant fallback
   `{before === undefined && after !== undefined ? String(after) : ""}`
   that duplicated exactly the same condition's output (e.g. an amount of
   `1456` rendered as `14561456`).
3. **Right-aligned Edit form** — every row-action component (e.g.
   `DailyExpenseRowActions.tsx`) renders its Edit/Archive/History `Modal`
   inside the same `<Td className="text-right">` Actions cell as the
   trigger buttons. A `<dialog>` shown via `showModal()` moves to the top
   layer only for _painting_ — it remains, for CSS inheritance purposes,
   exactly where it was declared in the DOM — so every dialog opened from
   an Actions cell silently inherited that cell's `text-align: right`.
   The Add form is unaffected because its `Modal` is declared in the
   page header, outside any `text-right` ancestor.
4. **False "Leave site?" prompts** — `OfflineProvider.tsx`'s
   `beforeunload` gate (`pendingCount + conflictCount + failedCount > 0`)
   was already scoped correctly (an empty or fully-synced queue never
   warns); the actual trigger was that every filter bar was a plain
   `<form action="...">` GET submission — a genuine full-page unload,
   which is exactly when `beforeunload` is _supposed_ to fire. Converting
   filters to `router.replace` (issue 5) removes the false trigger at its
   source: an SPA route change never unloads the document, so the
   listener is simply never reached from a filter change again.
5. **Manual "Apply Filters"** — `daily-expenses`, `assets`, and
   `audit-log` each built their own inline `<form>` with no client-side
   behavior at all.

## Decisions

1. **`Modal.tsx`** now sets `fixed inset-0 m-auto` (explicit horizontal
   _and_ vertical centering, independent of the UA default),
   `max-h-[calc(100vh-2rem)]` with its own `overflow-y-auto` (bounded to
   the viewport with internal scrolling, never taller than the screen),
   a responsive width (`w-[calc(100vw-2rem)] sm:w-full max-w-lg`), and
   `text-left` (an explicit reset so no ancestor's `text-align` can leak
   into a dialog regardless of where in the page it's mounted). This is
   the single shared primitive every add/edit/history/confirmation modal
   in the app already goes through (14 call sites, checked directly), so
   the fix applies everywhere at once — no page-by-page CSS patch.
2. **`HistoryButton.tsx`**'s diffing logic was extracted into a pure,
   unit-tested function, `diffAuditValues` (`src/lib/domain/audit-diff.ts`),
   returning `{ key, before, after, changed }` once per field. The
   component's render logic keeps the same before/after-with-strikethrough
   presentation, minus the redundant fourth branch that caused the
   duplication.
3. **No page-specific alignment fix was needed** — decision 1's `text-left`
   on `Modal` resolves the Edit-form alignment issue as a side effect,
   since it was the same root cause (inherited `text-align`) as issue 1.
4. **`OfflineProvider.tsx`'s gate was extracted** into a pure,
   unit-tested predicate, `shouldWarnBeforeUnload` (`src/lib/offline/unsaved-work.ts`),
   proving the existing SYNCED/empty-queue exclusion directly rather than
   only by inspection. The listener wiring itself is otherwise unchanged.
5. **A shared, client-side auto-apply filter layer** was built once and
   reused by all three filterable screens:
   - `src/lib/navigation/filter-query.ts` — pure helpers: `mergeFilterParams`
     (merges new values into the existing query string, dropping empty
     ones, preserving every other param, and always dropping `cursor`
     unless told to keep it) and `isValidDateRange` (an open-ended range is
     valid; `from > to` is not).
   - `src/components/filters/useFilterNavigation.ts` — the one hook every
     filter bar drives navigation from: `applyNow` (select/valid-date
     changes), `applyDebounced` (~300ms, free-text search only), and
     `reset`, all via `router.replace` inside `useTransition` (exposed as
     `isPending` for a subtle, non-blocking loading indicator).
   - `src/components/filters/useSyncedState.ts` — local field state that
     mirrors a server-supplied prop by default but reflects the user's
     own edit immediately; resynchronized on an _external_ prop change
     (Reset, back/forward) by adjusting state during render (comparing
     against the previously-seen prop value), not in a `useEffect` —
     `react-hooks/set-state-in-effect` flags an unconditional
     effect-driven `setState` as an avoidable extra render pass.
   - `src/components/filters/FilterBarShell.tsx` — the shared card, Reset
     Filters button, and in-flight indicator every filter bar renders
     inside.
   - `DailyExpenseFilters.tsx`, `AssetFilters.tsx`, `AuditLogFilters.tsx` —
     one small client component per screen, each field markup preserved
     from the original inline form, now wired to the shared hook instead
     of a native `<form>` submit. The "Apply Filters" button is removed
     everywhere; "Reset Filters" is kept (and added to Assets, which
     never had one before, for consistency across every filterable
     screen).

## Consequences

- Every overlay in the app — 14 call sites through the one `Modal`
  component — is now centered, viewport-bounded, and immune to inherited
  text alignment, without a single page-specific override.
- The History card renders each changed field exactly once; `diffAuditValues`
  is unit-tested for the Created/Updated/Archived/unchanged/empty shapes.
- Filter changes on `/daily-expenses`, `/assets`, and `/audit-log` no
  longer perform a full-page navigation, so `beforeunload` is
  structurally unreachable from a filter action; `shouldWarnBeforeUnload`
  is unit-tested for empty/synced/pending/failed/conflict queue shapes.
- `tests/e2e/entries.spec.ts` and `tests/e2e/phase5-reporting.spec.ts`
  were updated to match the new interaction (no "Apply Filters" click;
  "Reset Filters" is now a `<button>`, not an `<a>`).

## Known unrelated failure (verified, not caused by this change)

`tests/e2e/phase7-administration.spec.ts`'s "an Admin can create a party
... a case-insensitive duplicate is rejected" test fails with a Playwright
strict-mode violation (`getByText(/already exists/i)` resolves to two
elements) on the **unmodified base commit**, confirmed by temporarily
stashing every change in this ADR and re-running the exact same test.
`MasterDataManager.tsx` renders the same mutation error in two places at
once — a page-level `<Alert variant="warning">` and an inline
`<p className="text-error text-sm">` inside the modal — which is
pre-existing application behavior, untouched by anything in this ADR.
Left unfixed here as out of scope for this change; flagged for a
follow-up.

## Alternatives rejected

- **Per-page CSS overrides** for centering/alignment instead of fixing
  `Modal.tsx` itself — rejected; the task explicitly asked for the shared
  primitive to be fixed once, and every overlay in the app already shares
  one component.
- **A `useEffect` syncing local filter state to props** — rejected after
  `react-hooks/set-state-in-effect` flagged the unconditional
  effect-driven `setState`; replaced with React's documented
  render-time-adjustment pattern instead.
- **Keeping the "Apply Filters" button** as a fallback alongside
  auto-apply — rejected; every field already applies on its own (select:
  immediate, date: immediate once valid, text: debounced), so a button
  would be dead weight, not a safety net.
