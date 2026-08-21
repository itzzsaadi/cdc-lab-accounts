# ADR-0004: Phase 3A — Shared Application Shell and Reusable UI Foundation

## Status

Accepted.

## Context

Phase 3 was split, by client decision, into Phase 3A (the shared
authenticated shell and reusable component/design-token foundation) and
Phase 3B (the Operator transaction entry screens, not started). This ADR
records the architecturally significant decisions made while building
Phase 3A — route-group restructuring, the modal/drawer mechanism, and the
font/icon self-hosting approach — per `CLAUDE.md` §23/NFR-MNT-03.

## Decisions

### 1. Route-group restructuring — one shared layout, not three duplicated ones

The existing `(operator)`, `(partner)`, `(admin)` route groups were
siblings directly under `src/app/`, each with its own bare placeholder
page and no shared chrome. Giving each group its own copy of the same
`<AuthenticatedShell>` wrapper would have meant three near-identical
`layout.tsx` files to keep in sync. **Decision:** introduce
`src/app/(app)/layout.tsx` as a new parent segment, and move all three
route groups one directory level deeper (`src/app/(app)/(operator)/home`,
etc.). Since Next.js route groups (parentheses-named folders) never
appear in the URL, this is a pure file-move — `/home`, `/dashboard`, and
`/users` are unchanged, verified directly in the production build's route
table. `(auth)` and `/forbidden` deliberately stay outside `(app)` — a
signed-out or denied user shouldn't get sidebar chrome that presumes a
resolved role.

### 2. Native `<dialog>` for the mobile drawer and the user menu, not a hand-rolled focus trap

The mobile navigation drawer and the header's user menu both need
Escape-to-close, a focus trap while open, and focus returned to the
triggering element on close. **Decision:** both are native `<dialog>`
elements opened via `showModal()`. Modern browsers implement all three
behaviors for a modally-shown `<dialog>` natively — no custom
`focus-trap`-style library, no manual `keydown` listener for Escape, and
no manual "remember and restore focus" bookkeeping. `src/components/ui/Modal.tsx`
follows the same pattern for any future confirmation/detail dialog.
Verified directly, not assumed: `tests/e2e/shell.spec.ts` drives real Tab
and Escape key presses against the running dialog and asserts focus stays
inside it and returns to the trigger button afterward.

**Rejected alternative:** a hand-built overlay `<div>` with a third-party
focus-trap library or custom keyboard handling. Rejected because the
native element already provides the exact behavior needed, and adding a
library here would be exactly the kind of unnecessary dependency
`CLAUDE.md` §24 asks to avoid.

### 3. Incremental navigation — only routes that exist, never pre-populated

`docs/UI_REQUIREMENTS.md` §8 documents the full target navigation table
for every role (Daily Expenses, Party Income, Sync Center, Monthly
Expenses, Assets, Investment, Administration sub-tabs — none of which
exist yet). **Decision:** `src/lib/navigation/nav-items.ts` lists only
Home/Dashboard/Users today. Each later phase appends its own screen's nav
entry when that screen is actually built. This was an explicit
client decision, made to avoid dead links or fake destinations in the
shipped shell — the alternative (stub every future route now) was
considered and rejected for exactly that reason.

### 4. Fonts and icons — locally hosted via `next/font/local`, not `next/font/google`

The Phase 3 plan originally proposed `next/font/google` for Inter and
Material Symbols Outlined (self-hosted at build time, but still requiring
a network fetch to Google's servers during that build step). **Decision,
revised before implementation:** vendor the actual font files into the
repository (`public/design-assets/fonts/`) and load them via
`next/font/local`, so neither the build nor the running application ever
makes a request to `fonts.googleapis.com`/`fonts.gstatic.com`, under any
circumstance, in any environment. Files were obtained via `npm pack` of
`@fontsource/inter@5.3.0` and `@fontsource/material-symbols-outlined@5.3.3`
(the public npm registry, not a project dependency — only the static
`.woff2` files and each package's own `LICENSE` were kept; no
`@fontsource/*` line exists in `package.json`). Both fonts are
SIL Open Font License 1.1 — full text kept alongside each font file, and
source/version/checksum recorded in
`public/design-assets/fonts/PROVENANCE.md`. Only the weights and subsets
actually used are vendored (Inter: 400/500/600/700, Latin only; Material
Symbols Outlined: weight 400 only, Latin only) — no italic styles, no
`.woff` fallback, no other Unicode subsets, and no variable FILL/GRAD/opsz
axes, since this phase's shell icons don't need a filled/active-state
variant.

**No icon package dependency was added.** Material Symbols Outlined's
ligature-based usage (`<span class="material-symbols-outlined">home</span>`)
is exactly what the Stitch HTML already uses, so keeping the same font
preserves every icon name used throughout the handoff verbatim, instead of
mapping 61 icon names onto a different SVG icon set's naming for no
dependency-count benefit.

### 5. Design tokens — the HTML's embedded values, not `DESIGN.md`'s prose, where they disagree

`src/app/globals.css`'s `@theme` block was completed to the full color/
typography/spacing/radius scale `docs/UI_REQUIREMENTS.md` §8–§13 already
specifies, sourced from the 11 HTML files' embedded `tailwind.config`
(byte-identical across all of them) rather than `DESIGN.md`'s prose where
the two disagree — this reuses the radius resolution `UI_REQUIREMENTS.md`
§12/§25 already recorded (a true `9999px` pill radius reserved for
avatars/badges only; cards/buttons/dialogs keep the HTML's own
`DEFAULT: 0.125rem` / `lg: 0.25rem` / `xl: 0.5rem`). Tailwind v4's
`--text-*--line-height`/`--letter-spacing`/`--font-weight` companion
syntax (confirmed by reading `tailwindcss/dist/lib.js` directly) is used
for the 8-step typography scale, rather than approximating weights/line-
heights with ad hoc utility classes per screen.

## Consequences

- Every future business screen (Phase 3B onward) builds on one shell and
  one component set, rather than each screen re-deriving layout,
  navigation, and styling independently.
- The vendored font files must be kept in sync manually if Inter or
  Material Symbols Outlined are ever updated — `PROVENANCE.md` exists
  specifically so that's a deliberate, checkable action rather than silent
  drift.
- No new runtime dependency was added in this phase (`package.json` is
  unchanged from Phase 2 plus zero new lines).
- Route URLs are unchanged; no client-visible behavior regressed — proven
  by re-running the full pre-existing Phase 2 test suite (127 Vitest, 18
  Playwright) alongside the new Phase 3A tests.

## Related SRS Requirements

FR-AUTH-04/08, NFR-USE-01/03/05/06/07/08, NFR-CMP-01/02, `CLAUDE.md` §15/§16/§24.

## Approval Status

Approved by the client as part of the twice-revised Phase 3A plan
(navigation model, header composition, font/icon sourcing, and component
scope all explicitly decided in that approval message).
