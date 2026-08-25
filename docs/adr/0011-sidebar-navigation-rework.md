# ADR-0011: Sidebar and Navigation Rework

## Status

Accepted.

## Context

An audit of every authenticated route against `src/lib/navigation/nav-items.ts`
found that the six Phase 7 Administration screens (`/parties`,
`/expense-items`, `/expense-categories`, `/vendors`, `/profit-split`,
`/import`) had no sidebar link at all — reachable only by first landing on
`/users` and using the in-page `AdministrationTabs` bar (ADR-0009 decision
9), or by typing a URL directly. That decision was made deliberately in
Phase 7 to avoid touching `tests/e2e/shell.spec.ts`'s hard-coded nav-item
counts, but it means an Admin has no visible route to most of what they're
authorized to manage — a real usability gap now closed.

## Decision

1. **Every route an Admin is authorized for now has a real sidebar link.**
   `src/lib/navigation/nav-items.ts` gained six new `NavItem` entries
   (Parties, Expense Items, Expense Categories, Vendors, Profit Split,
   Historical Import), each `minRole: "ADMIN"`, matching the
   `requirePermission` call already at the top of each page unchanged.
   `AdministrationTabs` is kept as-is for moving between Administration
   screens once inside one — it's additive, not replaced.

2. **The sidebar is grouped into six sections**, in this fixed order:
   Overview, Daily Operations, Monthly Operations, Reports, Offline and
   Sync, Administration. `NAV_ITEMS` now carries a `section` field per
   item; `NAV_SECTIONS` is the ordered section list; `groupNavItems()`
   groups an already role-filtered item array by section, dropping any
   section a role has nothing in (an Operator, e.g., never renders a
   Monthly Operations, Reports, or Administration heading at all).
   `visibleNavItems()`'s permission filtering (`hasAtLeastRole`) is
   unchanged — this is presentational grouping layered on top of the same
   guard, never a new enforcement path (CLAUDE.md §15/§16).

3. **Audit Log moved into the Administration section** (previously a bare
   top-level item). It keeps its existing `minRole: "PARTNER"` — a Partner
   who isn't an Admin sees an "Administration" heading containing only
   Audit Log, which is a deliberate, accepted trade-off: grouping every
   Administration-labeled screen (including the one non-Admin exception)
   under one heading was preferred over inventing a second heading for a
   single item.

4. **Administration is the only collapsible section**, since it's the one
   large enough (8 possible items) to crowd the sidebar; every other
   section always renders open. It is **expanded by default** — every
   Admin-authorized route stays one click away with no interaction
   required — but a user may collapse it manually via a toggle button
   (`aria-expanded`, `aria-controls`). Navigating to a route inside
   Administration always shows it expanded, overriding any manual
   collapse; this is computed directly at render (`activeSectionId !==
section.id`), not via a `setState` call inside a `useEffect`, avoiding
   the cascading-render anti-pattern ESLint's `react-hooks/set-state-in-effect`
   rule flags.

5. **No change to enforcement, schema, or business logic.** Every
   Administration page still calls its own `requirePermission(...)`
   independently; `tests/integration/authorization/phase7-authorization-sweep.test.ts`
   and `tests/integration/authorization/full-surface-sweep.test.ts` are
   unchanged and still pass — sidebar visibility was never the guard, and
   still isn't.

6. **`tests/e2e/shell.spec.ts` and `tests/unit/navigation/nav-items.test.ts`
   were updated**, not weakened: the Admin nav-count assertion moved from
   15 to 21 (14 Partner-visible items, unchanged, + 7 Administration
   routes now visible without an extra click), with explicit per-link
   checks added for every new Administration route; a new test proves the
   Administration section can be collapsed and auto-re-expands on
   navigating into it. The Operator and Partner counts (6 and 14) are
   unchanged — neither role gained a new visible item.

## Responsive behavior (verified)

- **Desktop** (≥768px, Tailwind `md`): the existing fixed 260px sidebar
  (`ShellChrome.tsx`, unchanged) shows every expanded section.
- **Tablet** (768px, the `md` breakpoint itself): the fixed sidebar reserves
  its own width via `md:ml-sidebar-width` on the content column — it never
  overlays content. Proven directly: a Playwright test asserts the main
  content's bounding box starts at or after the sidebar's right edge at
  768px.
- **Mobile** (<768px): unchanged — the existing native `<dialog>`-based
  off-canvas drawer (hamburger, Escape, backdrop click, focus trap, focus
  return) already satisfied every stated requirement before this rework
  and needed no changes; `Sidebar` is shared verbatim between the fixed
  desktop nav and the drawer.
- **No horizontal overflow** proven at 375px, 768px, and 1440px against
  `/parties` — the Administration section's own page, chosen because it's
  now the most link-dense screen the sidebar renders.
- **Reduced motion**: no new animation was introduced — section
  expand/collapse is a conditional render (mount/unmount), not a CSS
  transition, and the existing `globals.css` `prefers-reduced-motion`
  block (unchanged) still covers the drawer/shell transitions that already
  existed.

This does not fix the pre-existing, disclosed NFR-USE-07 "Partial" status
in `docs/REQUIREMENTS_TRACEABILITY.md` (Phase 8A's overflow failure was on
data-grid screens, not the sidebar) — that remains open and untouched by
this change.

## Alternatives rejected

- **Leaving Administration collapsed by default.** Rejected: it would hide
  every Administration link behind an extra click for the only role that
  can use them, working against the explicit requirement that an Admin
  never need to type a URL manually.
- **A second "Administration" heading split for Partner's lone Audit Log
  item.** Rejected as unnecessary complexity for one link; see decision 3.
- **`useEffect` + `setState` to force-expand the active section.** Rejected
  after ESLint's `react-hooks/set-state-in-effect` flagged the cascading
  render; the override is instead computed inline at render time.

## Consequences

- An Admin can now reach every Administration screen directly from any
  page, with no intermediate stop on Users.
- `NAV_ITEMS`'s declaration order now matches its rendered (grouped) order,
  so `visibleNavItems()`'s flat order and the sidebar's visual order agree
  — a future reader doesn't need to cross-reference `NAV_SECTIONS` to
  predict how a role's items will render.
- ADR-0009 decision 9 is explicitly superseded (noted in place, not
  deleted, per the project's convention of keeping ADRs as a historical
  record).
