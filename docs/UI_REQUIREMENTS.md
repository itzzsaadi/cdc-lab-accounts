# UI_REQUIREMENTS.md — CDC Lab Accounts & Asset Management System

Authoritative implementation guide for the frontend, derived from `docs/SRS.md` (functional requirements, business rules, permissions) and the Google Stitch UI/UX handoff (visual hierarchy, layout, color, typography, spacing, component appearance, responsive presentation, interaction presentation). This document is a **reference for implementation**, not implemented code — nothing in `src/components/` exists yet, and this handoff review did not create any.

## 1. Design authority and purpose

Per the client's instruction, the Google Stitch design — received as 11 HTML/screenshot pairs plus `DESIGN.md` — is the **authoritative visual reference** for this application. It is not to be redesigned, reinterpreted, or second-guessed on appearance. This document exists to translate that design, alongside the SRS, into an implementation guide a future Phase 3+ engineer can build from without re-deriving decisions.

**Division of authority, exactly as instructed:**

| Authoritative source                     | Governs                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/SRS.md`                            | Business rules, financial formulas, permissions, validation, security, archiving, audit history, offline synchronization behavior, acceptance criteria |
| Stitch design (`docs/ui/stitch-export/`) | Visual hierarchy, layout, color, typography, spacing, component appearance, responsive presentation, interaction presentation                          |

Where the two conflict, **the SRS business rule controls** unless the client approves a requirements change — never silently pick one. Section 25 documents every conflict found during this review.

### Approved decisions (recorded 2026-08-20)

The client has reviewed the discrepancies and open questions raised by this review and made the following decisions. These are now binding for Phase 2+ implementation — not recommendations, not open questions. The detailed write-up in each affected section has been updated to match; this is the single place to look for the resolution itself.

| #   | Topic                                                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Product naming                                         | "LabFinance Pro" (as shown in every screen's header) is a Google Stitch placeholder, not an approved name. The approved product name is **CDC Lab Accounts System**. The formal descriptive name — used in the SRS, formal documents, and anywhere a fuller description is appropriate — remains **Lab Accounts & Asset Management System**. Every implementation of the sidebar/header wordmark uses "CDC Lab Accounts System"; "LabFinance Pro" is never carried into real code. |
| 2a  | Operator navigation (Critical discrepancy 1)           | **The SRS controls.** Operator navigation must not expose Reports, Financial Ledger, User Management, Partner Investment, profit/loss, profit split, or any other restricted financial area — see the updated §8 table.                                                                                                                                                                                                                                                            |
| 2b  | Cash-asset purchasing partner (Critical discrepancy 2) | **The SRS controls.** A Cash-acquisition asset requires a purchasing partner — this is not an optional checkbox. See the updated §10/§25.                                                                                                                                                                                                                                                                                                                                          |
| 2c  | Offline sync scope (Critical discrepancy 3)            | **The SRS controls.** Offline synchronization applies only to the transaction types the SRS specifies (daily expenses, monthly expenses, party income, counter income — the four tables carrying `client_uuid` per `CLAUDE.md` §14). Calibration, maintenance, or any other asset-synchronization concept is not part of this system and must not be built. See the updated §17/§25.                                                                                               |
| 3   | Tablet/mobile screenshots                              | Not currently available. **This does not block Phase 1.** Responsive behavior for Phase 3 Operator screens must follow the SRS and this document's documented responsive guidance (§7/§20). Tablet and mobile visual verification is a **gate on Phase 3 acceptance**, not on Phase 1, and not optional before that gate — see the updated §7.                                                                                                                                     |
| 4   | Border radius ("full") usage                           | Use a fully-rounded value equivalent to `9999px` **only** for pills, badges, circular avatars, and controls that are intentionally fully rounded. It is **not** the default radius for cards, forms, tables, dialogs, or ordinary buttons — those keep whatever radius the screen-specific HTML/`DESIGN.md` already shows for that component type. See the updated §12.                                                                                                            |
| 5   | Administrator Profile avatar photos                    | Do not use the externally hosted placeholder photographs. Production UI uses a **neutral initials-based avatar component** unless the client later supplies licensed profile images. See the updated §22/§27 and `docs/ui/ASSET_INVENTORY.md`.                                                                                                                                                                                                                                     |

## 2. Complete inventory of received files

23 files received, all accounted for and organized:

- **11 HTML exports** → `docs/ui/stitch-export/*.html`
- **11 screenshots (PNG, desktop viewport only)** → `docs/ui/screenshots/*.png`
- **1 design-token document (`DESIGN.md`)** → `docs/ui/stitch-export/DESIGN.md`

See `docs/ui/ASSET_INVENTORY.md` for the full per-file breakdown, including every external font/icon/image dependency and their licensing status. No file from the handoff is unaccounted for (verified by checksum during organization).

## 3. Complete screen inventory

Full table with HTML/screenshot sources, viewports, roles, routes, requirement IDs, components, coverage, and missing states: **`docs/ui/SCREEN_INVENTORY.md`**. Summary: 11 screens covering sign-in, Operator daily entry (home, daily expenses, party income grid), Partner monthly workflows (monthly expenses, asset register, monthly summary, dashboard, investment statement), one shared Admin hub (Administration Area), and one offline sync/conflict-resolution center.

## 4. Route recommendation for each screen

| Screen                                                                | Recommended route                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sign In                                                               | `src/app/(auth)/sign-in`                                                                        |
| Operator Home                                                         | `src/app/(operator)/home`                                                                       |
| Daily Expenses                                                        | `src/app/(operator)/daily-expenses`                                                             |
| Party Income Daily Grid                                               | `src/app/(operator)/party-income`                                                               |
| Offline Sync Center                                                   | `src/app/(operator)/sync-center`                                                                |
| Monthly Expenses                                                      | `src/app/(partner)/monthly-expenses`                                                            |
| Asset Register                                                        | `src/app/(partner)/assets`                                                                      |
| Monthly Summary Report                                                | `src/app/(partner)/monthly-summary`                                                             |
| Partner Dashboard                                                     | `src/app/(partner)/dashboard`                                                                   |
| Partner Investment Statement                                          | `src/app/(partner)/investment`                                                                  |
| Administration Area (Users/Parties/Items/Vendors/Profit Split/Import) | `src/app/(admin)` — one tabbed hub, or split into sub-routes; a Phase 7 decision, not made here |

These are recommendations for Phase 2 (routing skeleton) and Phase 3/4/7 (actual screens) to adopt or revise — nothing has been scaffolded under `src/app/` by this task.

## 5. User role for each screen

- **Operator-facing** (Partner/Admin inherit, per the role-inheritance model): Sign In, Operator Home, Daily Expenses, Party Income Daily Grid, Offline Sync Center.
- **Partner-facing** (Admin inherits): Monthly Expenses, Asset Register, Monthly Summary Report, Partner Dashboard, Partner Investment Statement.
- **Admin-only**: Administration Area.

This mapping is the SRS's role model (§2.6, FR-AUTH-03/04), **not** what the Stitch HTML currently renders — see the Critical finding in §25 about the sidebar showing identical navigation on every screen regardless of role.

## 6. Related SRS requirement IDs

Enumerated per-screen in `docs/ui/SCREEN_INVENTORY.md`. By requirement family, the handoff touches: FR-AUTH (sign-in, session), FR-DEXP (daily expenses), FR-PINC (party income, cash receipts), FR-CINC (counter income, via quick action only), FR-MEXP (monthly expenses), FR-AST (asset register), FR-INV (partner investment), FR-RES (monthly summary), FR-WARN (dashboard warnings), FR-OFF (sync center), FR-MST (administration hub), FR-IMP (historical import, entry point only), FR-RPT (dashboard, exports). **Not touched by any screen:** FR-AUD-04/05/06 (change history browsing) — see §26.

## 7. Desktop, tablet, and mobile layouts

**Desktop is fully specified.** All 11 screenshots are desktop captures (1600×1280 or 1920×~900–1056). The layout is DESIGN.md's "Fixed-Fluid hybrid": a fixed 260px sidebar (`sidebar-width` token) plus a fluid content area capped at 1440px max-width, 24px container margins, 16px gutters.

**Tablet and mobile are only partially specified.** No tablet or mobile screenshot was provided for any screen. What exists instead:

- Tailwind responsive utility classes in the HTML itself (`hidden md:flex`, `sm:flex-row`, etc.), implying a `768px` breakpoint threshold (Tailwind's default `md`), consistent with DESIGN.md's own text.
- DESIGN.md's prose: sidebar collapses to a bottom-sheet or hamburger drawer below 768px; margins reduce to 16px; all interactive elements maintain a 44px minimum touch target; `display-lg` scales from 32px down to 24px on mobile.

**Approved decision:** tablet/mobile screenshots are not currently available, and this does not block Phase 1 (database/domain work has no UI dependency). It **does** gate Phase 3: responsive behavior for the Operator screens (Daily Expenses, Party Income Grid, Operator Home, Sync Center) must be built following the SRS (NFR-USE-07) and this document's responsive guidance (§20), and **tablet/mobile visual verification against real captures or explicit client sign-off must occur before Phase 3's Operator interface implementation is accepted** — building and shipping a guessed mobile layout for the densest screen (SCR-04's day×party grid) without that verification is exactly the risk this gate exists to prevent.

## 8. Navigation structure by role

**Approved decision: the SRS controls.** Operator navigation must not expose Reports, Financial Ledger, User Management, Partner Investment, profit/loss, profit split, or any other restricted financial area — through the sidebar, any other client-side navigation, or a direct server request (FR-AUTH-04, `CLAUDE.md` §16).

**What the SRS requires** (§2.6, FR-AUTH-04, `CLAUDE.md` §16):

| Role     | Can navigate to                                                                                                            | Must NOT be exposed to (any form — link, icon, direct URL)                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator | Home, Daily Expenses, Party Income, Counter Income (quick action), Cash Receipt (quick action), Sync Center                | Reports, Financial Ledger, User Management, Asset Inventory/Register, Partner Investment, Monthly Summary, profit/loss figures, profit-split settings, Administration Area |
| Partner  | Everything Operator can, plus Monthly Expenses, Asset Register, Monthly Summary, Dashboard, Investment Statement           | User Management, master-data management, profit-split settings, Historical Import (Administration Area)                                                                    |
| Admin    | Everything Partner can, plus Administration Area (Users, Parties, Expense Items, Vendors, Profit Split, Historical Import) | —                                                                                                                                                                          |

**What the Stitch HTML actually shows:** every one of the 10 authenticated screens (all except Sign In) renders the _identical_ sidebar — Dashboard, Asset Inventory, Financial Ledger, Reports, User Management, Settings, Logout — with no visible role-based differences anywhere in the markup. This is the Critical discrepancy resolved in §25/decision 2a above: the navigation _styling_ (icon-first compact mode, active-tab left-border accent, hover states, footer Settings/Logout grouping) is exactly what should be kept; the _link set shown to each role_ is built per the "Must NOT be exposed to" column above, never copied from any single HTML file as-is. Server-side role checks (`CLAUDE.md` §15) remain the actual enforcement mechanism regardless of what the UI shows or hides.

## 9. Shared application shell

Common to every authenticated screen in the design:

- **Sidebar** (`src/components/layout`, future): 260px fixed desktop width, dark navy background (`on-background` token, `#123047`-family), brand mark + wordmark + tagline, nav links with icon + label, active-tab indicated by a 2px primary-teal left border, footer-pinned Settings/Logout group. **Approved decision: the wordmark reads "CDC Lab Accounts System", not "LabFinance Pro"** (a Stitch placeholder — see the Approved decisions record in §1) — the formal name "Lab Accounts & Asset Management System" is used where a fuller description is appropriate (e.g. document titles), not in the compact sidebar chrome. Two documented sidebar variants exist in the handoff: a "labeled" variant (SCR-02, SCR-06/07/08/09/10) and a "compact-with-inline-label" variant (SCR-03/05/11) — both render the same link set; DESIGN.md additionally describes a fully icon-only compact mode for small screens, not captured in any screenshot.
- **Header bar**: page title/breadcrumb area, a bell/notifications icon (with an unread-dot badge on at least one screen), a profile control (avatar + role label, e.g. "Admin"), and — inconsistently — a connection/sync icon. See §18 for why this needs to become consistent.
- **Content frame**: `max-w-[1440px] mx-auto`, `p-gutter` (16px) on mobile scaling to `p-container-margin` (24px) on larger screens.
- **Card primitive**: white (`surface-container-lowest`) background, 1px `outline-variant` border, `rounded-lg` (per the HTML's actual embedded radius scale — see §12), used for every data list, form panel, and stat tile across all 11 screens.

## 10. Reusable component inventory

Recurring components observed across the 11 screens, candidates for `src/components/ui/` and `src/components/layout/` once Phase 3+ actually builds them:

- **Stat tile** (label-caps heading + large tabular-nums figure) — Operator Home, Partner Dashboard, Monthly Summary.
- **Data table** (sticky header, right-aligned tabular-nums currency columns, row hover wash) — Daily Expenses, Asset Register, Administration (Users), Partner Investment (Detailed Statement).
- **Funding-source toggle** (Business/Partner radio pair with conditional partner selector) — Daily Expenses. Asset Register's Cash-mode fields show a related but distinct pattern (a "Funded by Partner" checkbox); **approved decision: for Cash-acquisition assets the purchasing partner is required, not optional** — implement it as "selecting Cash mode always requires choosing a partner," not an independent checkbox toggle. See §25, decision 2b in §1.
- **Acquisition-mode toggle** (two-button segmented control, Cash/Instalment, mutually exclusive, revealing conditional fields) — Asset Register.
- **Status/sync badge** ("dot + text": online/offline/conflict) — Party Income Grid, Offline Sync Center.
- **Warning callout** (icon + heading + body, used for both non-blocking dashboard warnings and blocking duplicate-category alerts) — Monthly Expenses, Partner Dashboard.
- **Slide-over / modal panel** ("Add New Asset") — Asset Register.
- **Provisional-data banner** — Partner Dashboard, Monthly Summary.
- **Quick-action button grid** — Operator Home, Partner Investment.
- **Sub-nav tab strip** — Monthly Expenses (Administration/Purchasing), Administration Area (Users/Parties/Items/Vendors/Profit Split/Import).
- **Two-column diff/comparison view** with per-field difference highlighting — Offline Sync Center (reusable pattern; the demo _content_ must not be reused, see §25).

None of these have been implemented as React components in this task — this is an inventory for Phase 3+, per the explicit restriction against building `src/components/ui/`/`src/components/layout/` now.

## 11. Typography system

Per `DESIGN.md` and confirmed identical across all 11 HTML files' embedded `tailwind.config`:

| Token          | Size / line-height              | Weight | Used for                                                                                                      |
| -------------- | ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `display-lg`   | 32px / 40px, `-0.02em` tracking | 700    | Page-level headings (scales to 24px below 768px per DESIGN.md — not visually verified)                        |
| `headline-md`  | 24px / 32px, `-0.01em` tracking | 600    | Section headings                                                                                              |
| `headline-sm`  | 18px / 24px                     | 600    | Card titles                                                                                                   |
| `body-lg`      | 16px / 24px                     | 400    | Primary body text                                                                                             |
| `body-md`      | 14px / 20px                     | 400    | Default UI text                                                                                               |
| `body-sm`      | 12px / 16px                     | 400    | Secondary/meta text                                                                                           |
| `tabular-nums` | 14px / 20px                     | 500    | **All financial figures and counts** — tabular numerals required so digits align vertically in ledger columns |
| `label-caps`   | 11px / 16px, `0.05em` tracking  | 700    | Table headers, small uppercase metadata labels                                                                |

Font family: **Inter** throughout (Google Fonts, weights 400/500/600/700), loaded live via `<link>` in every file — see §22 for the offline-hosting implication.

## 12. Color tokens

Full palette in `DESIGN.md` and reproduced identically in every HTML file's embedded `tailwind.config` (colors verified byte-identical across all 11 files after normalizing formatting). Key roles: `primary` deep teal (`#005c55`), `secondary` dark navy (`#46617a`), `tertiary` indigo (`#3b3bc9`, used specifically to mark partner-funded items per DESIGN.md), `error` (`#ba1a1a`), plus a full `surface`/`on-surface` tonal scale for backgrounds and text. Dark mode is declared (`darkMode: "class"`) but no dark-mode screenshot or values were provided — treat dark mode as **not in scope** until the client provides it.

**Discrepancy found and resolved:** `DESIGN.md` documents a `rounded` scale of `sm: 0.125rem, DEFAULT: 0.25rem, md: 0.375rem, lg: 0.5rem, xl: 0.75rem, full: 9999px`. The `borderRadius` actually embedded in every one of the 11 HTML files' `tailwind.config` is different and consistent across all of them: `DEFAULT: 0.125rem, lg: 0.25rem, xl: 0.5rem, full: 0.75rem` (no `sm`/`md` keys at all, and `full` is **not** a pill/circle radius) — very likely a generation error in the embedded config, not an intentional design choice.

**Approved decision:** use a fully-rounded value equivalent to `9999px` **only** for pills, badges, circular avatars, and any control that is intentionally fully rounded — never as the default radius for cards, forms, tables, dialogs, or ordinary buttons. Those non-circular component types keep whatever radius the screen-specific HTML actually shows for them (the `DEFAULT`/`lg`/`xl` values above, per component — see §9's card primitive, which already uses `rounded-lg`). In other words: fix the "full" token to a true `9999px` for the small set of genuinely circular/pill elements (avatars, status-dot badges, the segmented-toggle pill shape), and leave every other component's existing radius exactly as the HTML/screenshots show it — do not let this fix bleed into cards, buttons, or dialogs.

## 13. Spacing and sizing rules

From `DESIGN.md`, consistent with the embedded configs: 4px base unit, 16px gutter, 24px container margin, 260px sidebar width, 56px header height, and a **44px minimum touch target** applied to every interactive element observed (buttons, toggle segments, form inputs) — this is already reflected as `min-h-[44px]` classes throughout the HTML, directly supporting NFR-USE-07.

## 14. Form patterns

- **Persistent (non-floating) labels** above every input, per DESIGN.md's stated rationale (clarity during rapid data entry) — confirmed in every form across the handoff.
- **Border color states**: default `#CBD5E1`/`outline-variant`, focus ring + border in `primary` teal.
- **Radio-driven conditional reveal**: Daily Expenses' Business/Partner funding-source radio correctly shows/hides a partner-selector block and swaps helper copy between "reduces profit" and "increases investment" — this is the cleanest, most SRS-aligned form pattern in the whole handoff and should be the template for every other funding-source field (monthly expenses, in Phase 4).
- **Segmented two-button toggle for mutually-exclusive modes**: Asset Register's Cash/Instalment selector.
- **Inline demo-only JavaScript**: three files (`asset_register_code.html`, `daily_expenses_cdc_laboratories_code.html`, `party_income_grid_cdc_laboratories_code.html`) contain small vanilla-JS functions driving these show/hide interactions purely for the static mockup. **None of this JavaScript is to be copied into `src/`** — see §27.

## 15. Table and mobile-card patterns

Every data table in the handoff (Daily Expenses, Asset Register, Administration Users, Partner Investment Detailed Statement) uses: sticky header row, `label-caps` uppercase column headers, right-aligned `tabular-nums` currency columns, and a subtle gray row-hover wash (`surface-container-low`). **No screen demonstrates a table→card responsive transformation for mobile** — DESIGN.md doesn't describe one either, and no mobile screenshot exists to infer it from. This is the single biggest open interaction question for a data-dense system that must also work on a phone (NFR-USE-07) — flagged again in §20/§26.

## 16. Financial amount formatting

- **Tabular numerals mandatory** (`font-tabular-nums`, the `tnum` OpenType feature) for every currency figure, asset count, and PKR display — explicitly called out in DESIGN.md as required "to ensure decimal points and digits align vertically, allowing for rapid visual auditing."
- Currency columns are right-aligned in every table.
- Figures are shown as plain "Rs" / "PKR" prefixed numbers with thousand separators in the screenshots (consistent with NFR-USE-03); no explicit rule for negative-number/loss display (e.g. parentheses vs. minus sign vs. red text) was found anywhere in the handoff — this is a real gap, see §26.
- **This document does not specify or alter any financial formula.** How amounts are calculated remains entirely governed by `docs/SRS.md` §7/§8 and `CLAUDE.md` §7–§10; the Stitch design only governs how an already-calculated figure is displayed.

## 17. Status badges and synchronization states

DESIGN.md's stated pattern: "dot + text" badges — green dot = Online, amber dot = Offline, red dot = Conflict. Confirmed in the Party Income Grid (`Saved Online` primary-teal dot, `Offline Draft` amber `#D97706` dot) and the Offline Sync Center (`Conflict` label in an error-colored chip). **No single screen shows all three states together** — the grid shows two, the sync center's list shows the third in context. Asset-status badges (Cash/Instalment) use a different but related dot+label pattern with `primary` (Cash) and amber (`#f59e0b`, Instalment) dots.

**Approved decision on sync scope:** the SRS controls which entities these sync-state badges apply to. Offline synchronization — and therefore these Online/Offline/Conflict badges — applies **only** to the four transaction types the SRS specifies: daily expenses, monthly expenses, party income, and counter income (the tables carrying `client_uuid` per `CLAUDE.md` §14/DR-05). The Offline Sync Center's worked example in the handoff (an asset's "Calibration Status"/"Next Due Date") is not one of these and must not be implemented — see §25, decision 2c in §1. The two-column keep-local/keep-server comparison _pattern_ is still the right reusable UI for whichever of the four real entity types actually conflicts.

## 18. Empty, loading, validation, permission, offline, and error states

This is the weakest-covered area of the handoff — static mockups inherently show one populated "happy path" state per screen. What's present vs. missing:

| State                                      | Present?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Where / gap |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Empty (no data yet)                        | **Missing everywhere.** Asset Register shows populated assets despite FR-AST-01 requiring the register to start empty; no screen shows a "nothing here yet" treatment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Loading/skeleton                           | **Missing everywhere** — static HTML has no loading representation at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Validation error (field-level)             | **Missing everywhere** — no screen shows a rejected zero/negative amount (FR-DEXP-06) or any other field error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Permission-denied                          | **Missing** — no screen shows what an Operator sees if they somehow reach a restricted URL; per FR-AUTH-04 this must be enforced server-side regardless, but the _visual_ treatment (redirect? message?) isn't specified.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Offline/provisional                        | **Partially present** — Partner Dashboard's "Provisional figures (2 pending uploads)" banner and Monthly Summary's "PROVISIONAL" badge cover FR-OFF-12 well. But the connection-state + pending-count indicator that FR-OFF-03 requires "visibly, on every screen" is **not consistent**: most screens (Daily Expenses, Administration, Monthly Expenses, Partner Investment) show only a bare, textless "sync" icon button in the header with no visible state or count, while only Asset Register, Party Income Grid, Partner Dashboard, and Offline Sync Center show an actual online/offline/pending indicator. This is an important gap to close before Phase 6. |
| Error (failed save, network error)         | **Missing everywhere.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Confirmation (archive, destructive action) | **Missing** — NFR-USE-06 requires archiving to "require confirmation naming the record affected"; no screen shows this dialog, though Asset Register's slide-over panel demonstrates the right _kind_ of interaction pattern (modal with clear cancel/confirm) that an archive-confirmation could reuse.                                                                                                                                                                                                                                                                                                                                                              |

## 19. Accessibility requirements

- 44px minimum touch targets are consistently applied — a genuine accessibility positive, already noted in §13.
- Persistent (non-floating) labels aid screen-reader association more than floating labels would, though explicit `for`/`id` pairing was only spot-checked on Sign In (present and correct there) — not verified across all 11 files.
- Color is not used as the _only_ signal for status — the sync-state and asset badges pair a colored dot with a text label, which is good practice, but this should be verified to hold for colorblind users specifically once implemented (the Cash `primary` teal dot vs. Instalment amber dot pairing may need a contrast/pattern check).
- No `alt` text was found on the placeholder avatar `<img>` tags in several files (some have `alt="Administrator Profile"`, others have none at all with only a `data-alt` attribute holding an AI image-generation prompt, not real alt text) — this must be fixed regardless of which avatar approach is chosen in the real app.
- No skip-navigation link, ARIA landmark roles, or focus-trap behavior in modals (Asset Register's slide-over) was found — normal for a static mockup, but each must be added during React implementation, not inherited from the HTML.
- Dark mode is declared in config but has no provided values or screens — not accessible to evaluate.

## 20. Responsive behavior

See §7 for the desktop/tablet/mobile gap. What can be said with confidence: the HTML uses Tailwind's `sm:`/`md:`/`lg:` breakpoints throughout, the sidebar is `hidden md:flex` (implying it collapses below 768px, consistent with DESIGN.md's hamburger/bottom-sheet description), and 44px touch targets are applied uniformly — all good signs that responsive behavior was _designed for_, even though it was never _rendered and captured_ for review.

## 21. Interaction and keyboard behavior

- Three files contain real (if simple) inline JavaScript: `asset_register_code.html` (slide-over open/close with a CSS-transition delay), `daily_expenses_cdc_laboratories_code.html` (funding-source conditional reveal), `party_income_grid_cdc_laboratories_code.html` (grid row generation — **this one specifically fabricates random sync states via `Math.random()` for demo purposes and must never be treated as real logic**, see §27).
- No screen demonstrates keyboard-only operation of the Party Income Grid, despite NFR-USE-02 explicitly requiring "the daily party income grid shall be operable by keyboard alone" — this is a functional requirement with zero visual/interaction evidence in the handoff and will need to be designed during implementation, informed by the SRS requirement rather than the Stitch mockup (which has no keyboard-navigation affordance visible at all).
- Hover states (row wash, button color shifts) are specified via Tailwind `hover:` classes throughout; focus states are not clearly distinguished from hover states in most components — worth a deliberate pass during implementation for keyboard-focus visibility.

## 22. Icons, images, fonts, and other assets

Full detail in `docs/ui/ASSET_INVENTORY.md`. Summary:

- **Icons**: Material Symbols Outlined (Google Fonts, live CDN), 61 distinct icons used across the handoff (`add`, `dashboard`, `analytics`, `sync`, `wifi_off`, `warning`, `handshake`, `biotech`, `manage_accounts`, and 52 others). Offline-hosting decision required before Phase 6 (icons currently depend on a live network request, which contradicts FR-OFF-01's "load without a network connection once installed").
- **Fonts**: Inter (Google Fonts, live CDN, weights 400–700) — same offline-hosting caution.
- **Images**: exactly one placeholder "Administrator Profile" avatar photo per screen (9 of 11 screens), all externally hosted, AI-generated, licensing unconfirmed. **Approved decision: these images are not used.** Production UI uses a neutral initials-based avatar component unless the client later supplies licensed profile photos — see `docs/ui/ASSET_INVENTORY.md`.
- **No local/bundled image, icon, or font file exists anywhere in the handoff.**
- **Tailwind CDN script** — must never reach production; the project's real Tailwind v4 build already replaces it (configured in Phase 0).

## 23. Charts and reporting visuals

Partner Dashboard's "Income vs Expenses Trend" chart is a **static CSS/HTML construction** ("Simulated Chart Grid" / "Simulated Chart Bars" in the source comments) — not a real chart produced by any charting library, and not backed by any data-binding logic. No charting library is currently part of the approved technology stack (`CLAUDE.md` §4, `docs/adr/0001-technology-stack.md`) — choosing one is a **Phase 5 decision**, not something to resolve here, and not something this task installs. When that decision is made, match the visual style shown (teal/navy bars, clean axis, card-framed) rather than defaulting to a chart library's out-of-the-box look.

## 24. Screen-to-screen workflow mapping

Inferred from quick-action buttons, nav structure, and SRS use cases (no explicit flow diagram was provided in the handoff):

- **Sign In** → role-appropriate home (Operator Home for Operators; Partner Dashboard for Partners/Admins — the handoff doesn't show what an Admin's default landing screen is, distinct from a Partner's).
- **Operator Home** → Daily Expenses / Party Income Grid / (Counter Income modal) / (Cash Receipt modal), and → Offline Sync Center whenever entries are pending.
- **Monthly Expenses** and **Asset Register** are both reached from the Partner-facing sidebar directly (no evidence either links to the other, even though an instalment asset's monthly line appears inside Monthly Expenses per FR-AST-04 — this cross-reference is not visually represented anywhere).
- **Partner Dashboard** → Monthly Summary Report (for full detail) and → Partner Investment Statement; warning callouts on the Dashboard presumably deep-link to the relevant Monthly Expenses/Asset Register entry, though this is not shown.
- **Administration Area** is reached only from the Admin-visible sidebar; its six sub-tabs are siblings, not a further workflow.

## 25. Visible discrepancies between the Stitch design and `docs/SRS.md`

**Per the task's governing rule: the SRS controls every item below unless the client approves a requirements change.** The client has since reviewed this list and made the decisions recorded in §1's "Approved decisions" table — items 1, 2, 3, 4, and 7 below are now **resolved**; the rest remain open.

### Critical — resolved

1. **RESOLVED (decision 2a).** Every authenticated screen's sidebar was identical regardless of role, showing Asset Inventory, Financial Ledger, Reports, and User Management links to the Operator-facing Home and Daily Expenses screens exactly as it does to Partner/Admin screens — conflicting with FR-AUTH-04 and SRS §2.6. **The SRS controls**, per §1: §8 now specifies exactly what each role's sidebar must contain and must never expose; the Stitch sidebar's _visual styling_ is kept, its _link set per role_ is not.
2. **RESOLVED (decision 2b).** Asset Register's Cash-acquisition mode made the purchasing partner optional (an unchecked "Funded by Partner" checkbox), conflicting with DR-08/FR-AST-06/BR-09's requirement that every Cash-mode asset name a purchasing partner. **The SRS controls**, per §1: when Acquisition Mode = Cash, the partner field is required, not optional — see the updated §10.
3. **RESOLVED (decision 2c).** The Offline Sync Center's worked conflict-resolution example was about an asset's "Calibration Status" and "Next Due Date" — fields and a concept (equipment calibration/maintenance tracking) that don't exist in the SRS at all; assets also carry no `client_uuid` and aren't among FR-OFF-02's offline-enterable entities. **The SRS controls**, per §1: offline sync applies only to the four SRS-specified transaction types — see the updated §17. The two-column keep-local/keep-server _pattern_ remains reusable; the calibration/maintenance example content does not.

### Important

4. **RESOLVED (decision 4).** `DESIGN.md`'s documented `rounded.full: 9999px` didn't match the `0.75rem` actually built into every HTML file's `borderRadius.full`. Resolution: a true `9999px`-equivalent radius is used only for pills/badges/circular avatars/intentionally-fully-rounded controls; every other component type (cards, forms, tables, dialogs, ordinary buttons) keeps its existing non-circular radius exactly as shown in the HTML — see the updated §12.
5. The connection-state/pending-upload-count indicator required "on every screen" by FR-OFF-03 is inconsistently present — see §18. **Still open** — no client decision recorded yet.
6. No date-range control is visible on the Monthly Summary Report despite FR-RES-02/03 requiring one (default current month, adjustable, one-action prev/next). **Still open.**
7. **RESOLVED (decision 1).** The product was branded "LabFinance Pro" throughout every screen's header, which is a Google Stitch placeholder, not an approved name. Resolution: the approved product name is **CDC Lab Accounts System**; the formal descriptive name **Lab Accounts & Asset Management System** is used wherever a fuller description is appropriate — see the updated §9 and §1.

### Minor

8. Administration Area's "Historical Import" is shown only as a small upload widget, not FR-IMP-02's required "preview with errors marked" screen — likely just an unrendered tab state rather than a real gap, but worth confirming. **Still open.**
9. No negative-figure (loss) display convention (parentheses, sign, color) is shown anywhere, despite FR-RES-08 requiring the split to "apply the same split to a loss." **Still open.**

### No issue

10. The funding-source rule's _visual_ treatment on Daily Expenses (radio toggle, conditional partner field, "reduces profit"/"increases investment" copy) is fully consistent with BR-02/BR-05/BR-06 — no conflict, a model to replicate elsewhere.
11. The instalment/cash acquisition toggle's mutual exclusivity on Asset Register is fully consistent with DR-08/FR-AST-07.
12. The 30-day "Remember me" and "Forgot Password?" elements on Sign In are fully consistent with FR-AUTH-05/06.

## 26. Missing SRS-required screens, states, fields, actions, or responsive variations

Consolidated from the findings above (see `docs/ui/SCREEN_INVENTORY.md` for the per-screen table version):

- **Missing screen:** Change History / Audit Log browsing (FR-AUD-04, FR-AUD-05, FR-AUD-06, UC-14) — no representation anywhere.
- **Missing screen content:** full Parties / Expense Items / Vendors management views and the full Historical Import preview/validation flow (FR-MST-01/02/04, FR-IMP-02) — only tab labels and/or a small widget exist.
- **Missing state:** empty states, loading states, field-level validation errors, permission-denied, generic error/failed-save, and archive-confirmation dialogs — none shown anywhere (§18).
- **Missing field/control:** required-partner enforcement for Cash-mode assets (§25, item 2); date-range control on Monthly Summary (§25, item 6); negative/loss figure formatting convention.
- **Missing responsive variation:** no tablet or mobile screenshot for any of the 11 screens, and no table→mobile-card transformation demonstrated anywhere (§7, §15, §20).
- **Missing consistency:** the "visible on every screen" connection/pending-count indicator FR-OFF-03 requires (§18).

## 27. Implementation cautions for converting the static Stitch HTML into Next.js and React

**Read this before writing any component.**

1. **Never copy the Tailwind CDN `<script src="https://cdn.tailwindcss.com...">` tag or the inline `tailwind.config` script into any real page.** The project's real Tailwind v4 build (already configured in Phase 0 via `@tailwindcss/postcss`) is the only Tailwind setup that belongs in `src/`. Use the HTML's embedded config only as a _reference_ for token values (cross-checked against `DESIGN.md`, see §12's discrepancy).
2. **Never copy the inline `<script>` blocks verbatim.** All three scripts (`asset_register_code.html`, `daily_expenses_cdc_laboratories_code.html`, `party_income_grid_cdc_laboratories_code.html`) are vanilla-JS DOM manipulation written for a static demo — they directly call `document.getElementById`, toggle classes by hand, and in the grid's case **fabricate random data with `Math.random()`**. The _behavior_ they demonstrate (conditional field reveal, modal open/close, per-cell state coloring) is the right reference; the _code_ must be re-implemented as real React state/props bound to real data.
3. **Self-host or cache Inter and Material Symbols Outlined before Phase 6.** Both are currently loaded from live Google Fonts URLs in every file. A PWA required to "load without a network connection once installed" (FR-OFF-01) cannot depend on a live font/icon request — use `next/font/google` (which self-hosts at build time) or bundle an icon package, and ensure the service worker caches whatever is chosen.
4. **Do not source the placeholder avatar photos — approved decision, not just a recommendation.** They are externally hosted, licensing-unconfirmed, and likely ephemeral (see `docs/ui/ASSET_INVENTORY.md`). Build a neutral initials-based avatar component instead, unless the client later supplies licensed profile images.
5. **Treat every role-based navigation/permission cue in the HTML as illustrative, not authoritative.** The sidebar link set shown must be rebuilt per §8's SRS-derived table (an approved decision, not a recommendation), and — per `CLAUDE.md` §15/§16 — every route must independently verify role server-side regardless of what any client-side navigation shows or hides.
6. **Use "CDC Lab Accounts System" for the product wordmark, never "LabFinance Pro."** The formal name "Lab Accounts & Asset Management System" is for document titles and fuller descriptions, not compact UI chrome. See §1's Approved decisions record.
7. **Border radius: reserve the true `9999px`-equivalent value for pills, badges, circular avatars, and intentionally fully-rounded controls only.** Do not apply it as the default for cards, forms, tables, dialogs, or ordinary buttons — see §12.
8. **The `data-alt` attributes on avatar `<img>` tags are AI image-generation prompts, not accessible alt text** — some images additionally have a real (if generic) `alt="Administrator Profile"`, but this should be revisited for whatever real avatar solution replaces the placeholder photos.
9. **`href="#"` anchors throughout are non-functional placeholders**, standard for a static mockup — every one becomes a real route, form submission, or button `onClick` during implementation; none should be carried over as literal dead links.
10. **Money must still never touch a JS `number`.** Nothing in the Stitch HTML performs financial arithmetic (it's static markup with hardcoded example figures), so there is no calculation logic to accidentally inherit — but when wiring real figures into these layouts, `CLAUDE.md` §9/§10's `Decimal`-only rule applies exactly as it would anywhere else in the codebase.
11. **This design review changed no financial formula, permission rule, validation rule, or acceptance criterion.** Every business-logic requirement remains exactly as `docs/SRS.md` and `docs/REQUIREMENTS_TRACEABILITY.md` already state it; this document only adds the visual/interaction layer on top.
