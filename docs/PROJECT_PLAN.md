# PROJECT_PLAN.md — CDC Lab Accounts & Asset Management System

This plan sequences implementation into controlled phases derived from `docs/SRS.md` v3.0 and governed by the permanent rules in `CLAUDE.md`. Both documents are read-only inputs to this plan and are not modified by it.

**Ground rules carried into every phase (see `CLAUDE.md` for the full statement of each):**

- Money is `Decimal`/`NUMERIC(14,2)` everywhere, never floating point (DR-01, CLAUDE.md §9–10).
- No physical deletion of financial or master records — archive only (CON-04, DR-04, BR-15, CLAUDE.md §11).
- No stored profit/loss/investment totals — always derived on demand (DR-09, CLAUDE.md §12).
- No month locking, ever (CON-06, BR-12, CLAUDE.md §13).
- Every server endpoint independently checks role; hiding a control in the UI is never sufficient (FR-AUTH-08, NFR-SEC-03, CLAUDE.md §15).
- Operators have no route, server-side or UI, to profit/loss/investment/profit-split (FR-AUTH-04, CLAUDE.md §16).
- Every write is Zod-validated server-side regardless of client validation (NFR-SEC-05, CLAUDE.md §18).
- The full validation suite (`typecheck`, `lint`, `format:check`, `test`, `test:e2e`, `prisma validate`, `prisma format`, `build`) must pass before any phase is considered exited, not just the checks that seem relevant (CLAUDE.md §5).

**Resolved (was a Phase 5 open issue):** `CLAUDE.md` §27 documented that the Appendix A initial-data set (expenses summing to Rs 1,287,459) does not reconcile with AC-02's literal target figures (Rs 1,295,459 expenses / Rs 200,076 profit) because of the corrected `AT WASTE` duplicate line. **Approved resolution:** the Phase 5 reconciliation fixture reproduces the corrected figures (Rs 1,287,459 expenses / Rs 208,076 profit / Rs 104,038 per partner), since SRS §11.3 itself calls the duplicate line an error — see `docs/adr/0007-phase-5-calculations-dashboard-reports.md` §1 for the full record.

**Phase dependency order:** each phase assumes every prior phase's exit criteria are met. Phases are not parallelized against this order without an explicit decision recorded as an ADR (`CLAUDE.md` §23), since later phases depend on schema, auth, and domain logic settled earlier.

---

## Phase 0 — Repository and Development Foundation

### Objective
Stand up the engineering scaffolding — tooling, validation commands, documentation skeleton, and CI — with no business logic, no schema, and no screens. This phase makes every later phase's "done" criteria enforceable.

### Exact SRS requirement groups
- NFR-MNT-01 to NFR-MNT-09 (README, `.env.example`, ADRs, deployment runbook placeholder, migration discipline, result-calc test coverage hook, offline-test hook, static typing, lint/format enforcement)
- NFR-SEC-07 (secrets in environment configuration, never committed)
- CON-07 (single-developer maintainability, simplicity over premature optimisation)
- SRS §10 Documentation Deliverables (skeleton only: architecture.md, offline-sync.md, deployment.md, testing.md, CHANGELOG.md placeholders)

### Deliverables
- Next.js (App Router) + TypeScript strict project skeleton per `CLAUDE.md` §6 planned structure (empty route groups, no pages beyond a placeholder).
- `package.json` scripts: `typecheck`, `lint`, `format:check`, `test`, `test:e2e`, `prisma validate`, `prisma format`, `build`.
- ESLint + Prettier configuration; Vitest and Playwright configured with zero tests passing trivially.
- `README.md` sufficient for a competent engineer to run the system locally within 30 minutes (NFR-MNT-01).
- `.env.example` listing every environment variable with no real secrets (NFR-MNT-02).
- `/docs/adr/0001-technology-stack.md` recording the stack decision and alternatives rejected (NFR-MNT-03).
- Skeleton `/docs/architecture.md`, `/docs/offline-sync.md`, `/docs/deployment.md`, `/docs/testing.md`, `CHANGELOG.md`.
- CI pipeline running the full validation suite on every push.

### Tests
- CI green on an empty scaffold: typecheck, lint, format check, build all pass.
- A trivial Vitest and a trivial Playwright test both run and pass, proving the harnesses are wired correctly.

### Risks
- Over-scaffolding: adding tooling or dependencies not yet justified by a feature, contrary to CON-07 and `CLAUDE.md` §24's dependency-approval policy.
- Divergence between local and CI environments if Node/Postgres versions aren't pinned.

### Exit criteria
- All Phase 5 validation commands (§5 of `CLAUDE.md`) succeed on the skeleton.
- README onboarding demonstrated within 30 minutes by a second person or a clean-environment run.
- ADR-0001 committed.

### Features that must not be implemented yet
- No Prisma schema, no database tables.
- No authentication.
- No domain/business logic.
- No real UI screens, forms, or API routes.
- No offline/PWA capability.

---

## Phase 1 — Database and Domain Foundation

**Status: implemented.** See `docs/adr/0002-phase-1-schema-clarifications.md` for every deviation from SRS §6's literal text and the reasoning behind each one; see `docs/REQUIREMENTS_TRACEABILITY.md` for the requirement-by-requirement status.

### Objective
Implement the full 13-table Prisma schema exactly as specified in SRS §6 (with the disclosed deviations in ADR-0002), with every data-integrity rule enforced at the database level, and implement the pure, framework-agnostic calculation logic in `src/lib/domain` — unit-testable without a server or live database.

### Exact SRS requirement groups
- SRS §6 Database Design — all thirteen tables: `users`, `parties`, `expense_items`, `expense_categories`, `vendors`, `daily_expenses`, `monthly_expenses`, `party_income`, `counter_income`, `assets`, `capital_contributions`, `audit_log`, `app_settings`. (SRS §6's own introductory prose says "Twelve tables"; the section it introduces documents thirteen — an inconsistency inside the SRS itself, not corrected there since it is read-only, but corrected here — see ADR-0002 decision 1.)
- SRS §7 Data Integrity Rules — DR-01 to DR-09 in full.
- SRS §8 Business Rules — BR-01 to BR-15, at the level of detail each rule actually supports in a database-and-domain-only phase (see the coverage matrix in `docs/REQUIREMENTS_TRACEABILITY.md` — not every rule is "fully implemented" merely because Phase 1 touches it).
- Schema-level requirements only (data shape, not screens) from: FR-DEXP-01/05/06/08, FR-MEXP-01/03/04/05, FR-PINC-01 to 09 (shape), FR-CINC-01/02/04, FR-AST-01 to 10, FR-INV-01/02/06, FR-RES-04 to 07/11 (pure calculation functions), FR-MST-01 to 07 (table shape only).

### Deliverables
- `prisma/schema.prisma` with all thirteen tables, every money column as `Decimal`/`NUMERIC(14,2)`, every `TIMESTAMPTZ` column, and every enum (`role`, `billing_mode`, `expense_group`, `funding_source`, `asset_classification`, `acquisition_mode`, `asset_status`, `receipt_type`, `contribution_type`, `audit_action`). `users.password_hash` is intentionally omitted and `app_settings.updated_by` is nullable — both disclosed deviations, ADR-0002.
- `client_uuid UUID NOT NULL UNIQUE` on exactly `daily_expenses`, `monthly_expenses`, `party_income`, and `counter_income` (DR-05) — the offline sync mechanism itself is not built until Phase 6, but the column and its unique index exist from this phase forward.
- Database `CHECK` constraints: bidirectional funding-source exclusivity (DR-07, approved decision — stricter than SRS's literal one-directional text); asset `acquisition_mode` mutual exclusivity (DR-08); per-table monetary positivity (`> 0` or `>= 0` as appropriate).
- Database triggers: partner-eligibility (funded_by_user_id/purchased_by_user_id/partner_user_id must reference a real partner), audit-log append-only (rejects UPDATE/DELETE), and physical-deletion rejection on all thirteen tables (BR-15/DR-04/CON-04 — not merely inferred from absent delete code).
- A partial unique index preventing duplicate active instalment rows for the same asset and month, while preserving archive-then-correct history.
- `is_archived` on every financial-entry table except `assets` (which uses `status` as its sole archive representation, per ADR-0002 decision 6) and `is_active` on master-data tables.
- Initial migration, hand-edited for the above and committed alongside the schema (`prisma/migrations/20260820170711_init/`).
- `src/lib/domain` pure functions: funding-source rule application, total income/expense aggregation, net profit/loss, a deterministic profit-split rounding rule, and partner investment aggregation (including `DRAWING` sign handling) — all operating on `Decimal`, all framework-agnostic.
- Seed script (`prisma/seed.ts`) loading Appendix A **master data only** — parties, expense items, expense categories, vendors, the default 50/50 profit split. Deliberately seeds **zero** `users` rows and **zero** July 2026 transaction amounts (ADR-0002 decision 2/4; Appendix A.5's own text says no password is ever chosen by the developer).
- `@prisma/adapter-pg`, `pg`, `@types/pg` (Prisma 7 requires an explicit driver adapter — there is no bare-connection-string fallback) and `tsx@4.23.12` (exact-pinned dev dependency, to run `prisma/seed.ts` via Prisma 7's `migrations.seed` config field — flagged during implementation and **retroactively approved**, since Prisma 7 requires some TypeScript execution mechanism for a `.ts` seed script and no existing project dependency provides one) added as dependencies.

### Tests
- `npx prisma validate` and `npx prisma format` pass.
- Migration applies cleanly to a fresh Postgres instance via `prisma migrate deploy` and `prisma migrate status` shows no drift. (Not claimed to be automatically "reversible" — no down-migration exists; recovery is restore-from-backup for any environment with real data.)
- Constraint/trigger tests (`tests/integration/constraints/`): funding-source bidirectional exclusivity, partner-eligibility triggers, asset acquisition-mode exclusivity, monetary positivity, `client_uuid` uniqueness, counter-income non-blocking duplicates, instalment idempotency (reject-duplicate and archive-then-correct), audit-log append-only, physical-deletion rejection (every listed table), and foreign-key delete-rule inspection (RESTRICT/NO ACTION only, never CASCADE/SET NULL).
- Vitest unit tests for every `src/lib/domain` function against small synthetic (non-July-2026) fixtures, confirming `Decimal` arithmetic (no float coercion) and the rules each function actually implements.
- `tests/integration/seed.test.ts` confirms the seed loads the expected master-data counts and zero users/credentials/transactions.

### Risks
- Getting the `CHECK`/trigger syntax wrong for the funding-source, acquisition-mode, partner-eligibility, and delete-protection rules — proven with failing-insert/failing-delete tests, not just declared.
- Prisma's `Decimal` type surfacing as a JS `number` accidentally in generated types or serialization — guarded against in `src/lib/domain/money.ts`, the one file in the domain layer that touches the generated client at all.
- Two disclosed SRS deviations (`users.password_hash` omitted, `app_settings.updated_by` nullable) must be carried into Phase 2/7 correctly — ADR-0002 is the durable record.

### Exit criteria
- Full schema matches SRS §6 table-for-table, column-for-column, except the disclosed ADR-0002 deviations.
- Every DR-01 to DR-09 rule is enforced and proven by a failing-insert/failing-delete test.
- `src/lib/domain` functions are unit-tested and importable with no server or HTTP context.
- Seed script loads Appendix A master data without error, and without any user or transaction row.

### Features that must not be implemented yet
- No authentication or session handling; no Better Auth `session`/`account`/`verification` tables (Phase 2).
- No API routes or UI screens.
- No offline queue (Dexie) or sync logic — Phase 6 only.
- No audit log **writes** from application code yet (the table and its append-only trigger exist; nothing writes to it until Phase 2 onward).
- No July 2026 reconciliation fixture, and no July transaction amounts anywhere — Phase 5 only.
- No instalment-line generation mechanism (Phase 4) and no resolution of the AT WASTE Rs 8,000 discrepancy (`CLAUDE.md` §27).

---

## Phase 2 — Authentication and Authorization

**Status: Implemented.** See `docs/adr/0003-phase-2-authentication.md` for the full design record — Better Auth integration, the two-layer invitation-acceptance mechanism (a project-owned, SHA-256-hashed gate token wrapping Better Auth's own public `requestPasswordReset`/`resetPassword` endpoints, never Better Auth internals), the corrected sign-in sequencing that guarantees a locked/inactive account's session never reaches the browser, the centralized `requirePermission` authorization layer, and the fail-closed email-delivery and production-HTTPS safeguards. Deliverables below were implemented largely as planned, with these deviations, each recorded in the ADR: session/lockout/audit event helpers live in `src/lib/auth/` rather than session-fetching living in `src/server/session.ts` (a Better-Auth-instance-dependent concern, kept out of the framework-agnostic `lib` layer); the Better Auth instance is built via a `buildAuth(prisma, baseURL)` factory (`src/lib/auth/config.ts`) rather than a bare module-level singleton, specifically so integration tests can bind it to the test database.

### Objective
Implement sign-in, session management, and the three-role permission model (`OPERATOR`, `PARTNER`, `ADMIN`) with server-side enforcement, using Better Auth. Begin audit-log writes for authentication events.

### Exact SRS requirement groups
- FR-AUTH-01 to FR-AUTH-09 (all).
- NFR-SEC-01, NFR-SEC-02, NFR-SEC-03, NFR-SEC-04, NFR-SEC-05, NFR-SEC-08, NFR-SEC-10 (the security requirements auth touches directly).
- FR-AUD-07 (sign-in, failed sign-in, password-change events recorded).
- DR-03 (`created_by`/`updated_by` attribution pattern, established here for reuse by every later entity).

### Deliverables
- Better Auth configuration: email/password sign-in, password hashing per FR-AUTH-02, single-use password-reset link expiring after 60 minutes (FR-AUTH-06).
- Session persistence for 30 days (FR-AUTH-05); HTTP-only, Secure, SameSite cookies (NFR-SEC-08).
- Account lockout after 10 consecutive failed sign-ins (FR-AUTH-07).
- `src/lib/auth` role-guard helpers (`requireRole`, session verification) usable identically from API routes and server actions — the single place every later endpoint calls into (FR-AUTH-08, NFR-SEC-03).
- Sign-out that ends the server session, with a placeholder hook for the Phase 6 "entries waiting to upload" warning (FR-AUTH-09).
- `audit_log` writes for `LOGIN`, failed login, and password-change events (FR-AUD-07).
- A minimal placeholder protected route per role, used only to prove the guard works end-to-end.

### Tests
- Integration tests: an `OPERATOR`-guarded route rejects an `ADMIN`-only or `PARTNER`-only request at the server, independent of any UI.
- Playwright e2e: sign-in, sign-out, password-reset flow, session persistence across a simulated restart.
- Lockout test: 10 consecutive failures lock the account; the 11th legitimate attempt is blocked until unlock/reset.
- Audit-log assertions: login, failed login, and password-change events appear correctly attributed.

### Risks
- Modeling role inheritance (`PARTNER` ⊇ `OPERATOR`, `ADMIN` ⊇ `PARTNER`) incorrectly in the guard helper, creating a privilege gap or an over-restriction discovered only later.
- Session cookie misconfiguration (missing `Secure`/`SameSite`) shipped unnoticed without an explicit inspection step (NFR-SEC-08 is verified by inspection, not just a test).
- Treating the UI hiding a link as sufficient — every guard must be proven by a direct server-side request test, not a UI click-path only.

### Exit criteria
- FR-AUTH-01 to 09 all demonstrated.
- The role-guard mechanism is proven reusable and is the only authorization path any later phase's endpoints use.
- Login-related audit events are being written correctly.
- Full AC-08 verification is **not** expected yet (no financial screens exist to attempt to reach) — this phase proves the mechanism only; AC-08 is finally closed out in Phase 5.

### Features that must not be implemented yet
- No operator transaction entry screens (Phase 3).
- No monthly expense/asset/investment screens (Phase 4).
- No financial results, dashboard, or reports (Phase 5).
- No offline/PWA support (Phase 6).
- No master-data admin UI or profit-split settings screen (Phase 7).

---

## Phase 3: Shared Application Shell and Operator Transaction Workflows

Split, by client decision, into two sub-phases sharing one exit gate: **Phase 3A** (the authenticated application shell and reusable UI foundation every later business screen builds on) and **Phase 3B** (the Operator transaction entry screens themselves). This split does not renumber any later phase — Phase 4 onward still assumes "Phase 3" in its entirety (3A + 3B) is complete.

---

### Phase 3A — Shared Authenticated Shell and Reusable UI Foundation

**Status: implemented.** See `docs/adr/0004-phase-3a-shared-shell.md` for the full design record — the `(app)` route-group restructuring, the native-`<dialog>`-based mobile drawer and user menu, the locally-hosted Inter/Material Symbols Outlined fonts, and the incremental (never-speculative) navigation model.

#### Objective
Build the sidebar/header chrome, the reusable `src/components/ui/` primitive set, and the completed design-token system every Operator/Partner/Admin screen shares — with no business/financial functionality of its own, so Phase 3B (and every later phase) plugs into a stable shell rather than each screen re-deriving layout, navigation, and component styling independently.

#### Exact SRS requirement groups
- FR-AUTH-04/08 (navigation never exposes a restricted area to Operator; server-side permission checks remain the only real enforcement — the shell's nav filtering is presentational only).
- NFR-USE-01, NFR-USE-03, NFR-USE-05, NFR-USE-06, NFR-USE-07, NFR-USE-08 (terminology, money-formatting groundwork via `tabular-nums`, a reusable confirmation/modal primitive, 44px touch targets, English-only).
- NFR-CMP-01/02 (cross-browser baseline established early; full verification remains Phase 8).

#### Deliverables
- `src/app/(app)/layout.tsx` wrapping `(operator)`, `(partner)`, `(admin)` route groups (moved one level deeper, public URLs unchanged) in `AuthenticatedShell`.
- `src/components/layout/{AuthenticatedShell,ShellChrome,Sidebar,Header,UserMenu}.tsx` — fixed desktop sidebar, a native-`<dialog>` mobile drawer (Escape-to-close/focus-trap/focus-return all come from `showModal()`, not hand-rolled), and a header with a mobile menu button, contextual page title, initials avatar, role label, and a user menu with sign-out. No notification bell or sync indicator — real sync state is Phase 6's job, and a non-functional icon was rejected as implying a feature that doesn't exist.
- `src/lib/navigation/nav-items.ts` — an **incremental** nav table (only routes that exist today: Home/Dashboard/Users), filtered per role by the existing `hasAtLeastRole` rank comparison; never pre-populated against not-yet-built routes.
- `src/components/ui/{Button,TextInput,Select,Checkbox,Card,Table,Badge,Alert,Modal,EmptyState,LoadingSkeleton,Avatar}.tsx` — minimal, accessible primitives; `Modal` and the mobile drawer both use the native `<dialog>` element rather than a hand-rolled focus trap.
- `src/lib/fonts.ts` — Inter and Material Symbols Outlined self-hosted via `next/font/local` from vendored, OFL-1.1-licensed `.woff2` files under `public/design-assets/fonts/` (never `next/font/google` — no Google Fonts request at build or runtime). Full provenance/checksums in `public/design-assets/fonts/PROVENANCE.md`.
- `src/app/globals.css` — the complete DESIGN.md/Stitch-HTML token set (full color palette, 8-step typography scale, spacing, radius — `full`/pill reserved for avatars/badges only, per the already-approved radius decision), plus `prefers-reduced-motion` handling.
- The four existing `(auth)` screens (Sign In, Forgot Password, Reset Password, Accept Invitation) retrofitted onto the new `Button`/`TextInput`/`Card`/`Alert`/`Checkbox` primitives — a behavior-preserving refactor, re-verified against the full Phase 2 security test suite.
- A session-expired banner on Sign In, shown only when the shell's own redirect finds a stale/invalidated session cookie (never for a plain not-yet-signed-in visit).
- `/forbidden` restyled onto the shared design tokens; deliberately kept outside `(app)` (no sidebar chrome for a denied role).

#### Tests
- Unit: `nav-items.test.ts` (role-filtering and contextual-title lookup), `avatar.test.ts` (initials/deterministic color).
- Playwright (`tests/e2e/shell.spec.ts`): per-role nav-item DOM presence/absence (not merely CSS-hidden) for Operator/Partner/Admin; a Partner denied direct navigation to `/users`; mobile drawer opens via the hamburger, traps Tab focus, closes on Escape, and returns focus to the trigger; no horizontal scroll at a 375px viewport; user menu opens/closes by keyboard and signs out; the skip-navigation link is the first focusable element and targets `#main-content`; zero requests to `fonts.googleapis.com`/`fonts.gstatic.com` and zero console errors across sign-in + the authenticated shell.
- All pre-existing Phase 2 Vitest (127) and Playwright (18, including the 9 already-existing auth specs) tests re-run and passing after the retrofit and route move.

#### Risks
- Two `nav[aria-label="Primary"]` elements exist in the DOM simultaneously by design (the always-present desktop sidebar and the mobile drawer's own copy) — a closed native `<dialog>`'s content is present but not rendered, so this is not an accessibility duplicate in practice, but it is a real thing to remember when writing future DOM-querying tests against the sidebar.
- `next/font/local`'s vendored files must be kept in sync if Inter/Material Symbols Outlined are ever updated — `PROVENANCE.md` records the exact source/version/checksum specifically so a future update is a deliberate, checkable action, not a silent drift.

#### Exit criteria
- Shell renders correctly, and role-appropriate navigation is proven by direct DOM inspection, for all three roles.
- Every required Phase 3A verification item (role nav differences, direct-URL protection, mobile drawer keyboard/focus behavior, user menu/sign-out, skip-navigation, loading/error/not-found/forbidden/session-expired states, no external font/icon request, no console errors, unchanged auth behavior, unchanged public route URLs, byte-for-byte-unchanged Stitch exports) is demonstrated — see the Phase 3A completion report for the full checklist.
- Full `CLAUDE.md` §5 validation suite passes.

#### Features that must not be implemented yet
- No daily expense/party income/counter income/cash receipt entry forms (Phase 3B).
- No monthly expense/asset/investment workflows (Phase 4), no results/dashboard/reports (Phase 5), no master-data admin CRUD (Phase 7).
- No offline/PWA behavior (Phase 6) — the shell has no sync indicator at all yet, deliberately.

---

### Phase 3B — Operator Transaction Workflows

**Status: implemented.** See `docs/adr/0005-phase-3b-operator-workflows.md` for the full design record — client-generated-`client_uuid` create-idempotency (backstopped by the database's own unique constraint under genuine concurrency, never the `findUnique`-then-`create` sequence alone), the strict Karachi-calendar-date utilities, the transaction-scoped `appendBusinessAudit` helper, the additive `party_income_active_daily_cell_unique` migration, the Party Income grid's autosave state machine, Daily Expense filter controls and edit/archive UI, and the shared `formatMoney` display formatter (applied across every Phase 3B screen). A closure pass completed FR-DEXP-07's filter controls, FR-DEXP-09's edit/archive UI, and NFR-USE-03's thousands-separator formatting, all of which now carry `Implemented` status. Not everything originally scoped is fully delivered: FR-PINC-07/08's totals are scoped to the current calendar month only, and FR-PINC-07's monthly-bill component waits on Phase 4 (FR-PINC-03) — see `docs/REQUIREMENTS_TRACEABILITY.md` for the row-by-row detail.

#### Objective
Build the day-to-day entry screens used by reception staff: daily expenses, daily-billing party income (grid), direct cash receipts, and counter income — entirely online, with no financial-result leakage to the Operator role.

#### Exact SRS requirement groups
- FR-DEXP-01 to FR-DEXP-09 (FR-DEXP-10 receipt photo is priority C — may be deferred past this phase; see below).
- FR-PINC-02, FR-PINC-06, FR-PINC-07, FR-PINC-08, FR-PINC-09.
- FR-CINC-01 to FR-CINC-04 (FR-CINC-05, priority S, may be folded into Phase 5's warnings work instead).
- FR-AUD-01, FR-AUD-02 (creation/change/archive audit entries, now exercised for real entry types).
- FR-AUTH-04 (reconfirmed: none of these screens or their APIs expose profit/loss/investment).
- NFR-USE-01, NFR-USE-02, NFR-USE-03, NFR-USE-04, NFR-USE-06, NFR-USE-07 (usability of entry screens).
- NFR-PERF-01, NFR-PERF-02, NFR-PERF-03 (load, navigation, save-confirmation timing).
- UC-02, UC-03, UC-04, UC-05.

#### Deliverables
- `src/app/(app)/(operator)` routes (built on Phase 3A's shell): daily expenses (list + add/edit/archive with running total), daily-billing party income grid (keyboard-operable, matching workbook layout), direct cash receipt form, counter income daily entry.
- `src/lib/validation` Zod schemas for each entry type, rejecting zero/negative/non-numeric amounts with field-level errors (FR-DEXP-06).
- Archive actions requiring confirmation naming the specific record (NFR-USE-06); no physical deletion.
- Running totals computed via the Phase 1 `src/lib/domain` functions, never typed by a user (FR-DEXP-08, FR-PINC-07).
- Duplicate-counter-income-for-date warning, non-blocking (FR-CINC-04).
- Audit-log writes wired for every create/edit/archive of these four entry types.

#### Tests
- Vitest: validation schemas reject invalid amounts with correct field-level messages.
- Integration tests: full CRUD + archive lifecycle for each of the four entry types, confirming `is_archived` is set rather than a row deleted.
- Playwright e2e: enter a daily expense (including a Partner-funded one naming the partner), enter a full day of grid income by keyboard only (NFR-USE-02), enter a direct cash receipt, enter counter income twice for the same date and confirm the non-blocking warning appears.
- Spot-check integration test: an Operator session cannot retrieve any endpoint exposing profit/loss/investment introduced so far (full AC-08 sweep happens in Phase 5 once all financial endpoints exist).

#### Risks
- Keyboard-only grid navigation (NFR-USE-02) is genuinely fiddly to get right and easy to regress silently.
- The "warn but never block" requirement (FR-CINC-04, FR-WARN-03 in spirit) is easy to accidentally implement as a hard validation error.
- Confusing "archive" with "delete" in a UI copy or API name, undermining CON-04/DR-04.
- Tablet/mobile visual verification against real captures (or explicit client sign-off) remains the documented gate on this sub-phase's acceptance (`docs/UI_REQUIREMENTS.md` §7) — Phase 3A's own shell responsive behavior is implementation-derived and tested, but is not itself that visual sign-off.

#### Exit criteria
- UC-02, UC-03, UC-04, UC-05 fully demonstrated.
- FR-DEXP-01 to 09, FR-CINC-01 to 04, FR-PINC-02/06/07/08/09 implemented and tested.
- Audit trail present and correct for every entry type in this phase.

#### Features that must not be implemented yet
- No monthly expenses, assets, capital contributions, or investment statements (Phase 4).
- No results/dashboard/reports/warnings screens (Phase 5) — beyond the running totals required by FR-DEXP-08/FR-PINC-07 themselves.
- No offline entry or sync (Phase 6) — these screens are online-only until then.
- No master-data admin CRUD (parties/items are consumed from Phase 1 seed data only; Phase 7 adds management UI).
- FR-DEXP-10 (receipt photo attachment, priority C) and FR-CINC-05 (missing-day list, priority S) may be deferred to Phase 5 or later without blocking this phase's exit.

---

## Phase 4 — Monthly Expenses, Assets, and Partner Investment

**Status: implemented.** See `docs/adr/0006-phase-4-monthly-assets-investment.md` for the full design record — the additive `assets.default_category_id` column and `party_income_active_monthly_party_month_unique` partial unique index (one migration, both changes), the Partner-triggered/previewed/confirmed instalment-generation and recurring-prefill batch actions (per-asset/per-line transactions, never one shared transaction), the new Monthly Party Bill route and permission, and the explicit decision to add only real navigation entries for this phase's screens — no dashboard, report, or warnings functionality, which remain entirely Phase 5's scope. Not everything originally scoped is fully delivered: FR-MEXP-02's Admin category add/rename/archive CRUD remains Phase 7's FR-MST-03 (Phase 4 delivers only the active-category picker), and FR-PINC-08's "any range" text is only satisfied for a calendar month — an arbitrary custom date range is deferred, likely to Phase 5 — see `docs/REQUIREMENTS_TRACEABILITY.md` for the row-by-row detail.

### Objective
Build the Partner-only, monthly-cadence workflows: administration and purchasing expenses, monthly party billing, the asset register with its strict instalment/cash rule, capital contributions, and the partner investment statement.

### Exact SRS requirement groups
- FR-MEXP-01 to FR-MEXP-08.
- FR-PINC-03 (monthly party bill entry — Partner-only per UC-07, distinct from the Operator-facing daily grid in Phase 3).
- FR-AST-01 to FR-AST-10.
- FR-INV-01 to FR-INV-07.
- FR-AUD-01, FR-AUD-02 (extended to these entity types).
- UC-06, UC-07, UC-08, UC-09, UC-11.

### Deliverables
- `src/app/(partner)` monthly expenses screen: Administration and Purchasing entered separately, totalled together for display (FR-MEXP-04); the daily-expense total appears automatically as a **read-only** Purchasing line (FR-MEXP-03); recurring-line pre-fill from the previous month requiring confirmation (FR-MEXP-06); same-category-twice-in-a-month allowed with a warning (FR-MEXP-08).
- Monthly party bill entry screen (FR-PINC-03), feeding the same per-party monthly total calculation as Phase 3's daily grid and cash receipts (FR-PINC-07, reused from `src/lib/domain`).
- Asset register CRUD: `INSTALMENT` vs `CASH` toggle enforced at form, API/Zod, and DB layers (FR-AST-07, DR-08); instalment assets auto-generate their monthly expense line each month with no partner tag (FR-AST-04, BR-09); cash assets record `purchased_by_user_id` and `purchase_price`, adding to that partner's investment, never an expense (FR-AST-06, BR-08); archiving an asset stops future instalment lines without altering past months (FR-AST-08).
- Capital contribution entry (`INITIAL`/`INJECTION`/`DRAWING`) (FR-INV-03, FR-INV-04).
- Partner investment statement: itemised, running-balance view combining capital contributions, partner-funded expenses, and cash-bought assets (FR-INV-05), visible to Partners/Admins only (FR-INV-07), never affecting the profit split (FR-INV-06).

### Tests
- Integration tests replicating the SRS §2.4 worked example exactly: a Business-paid utility bill reduces profit only; a Partner-paid utility bill leaves profit unchanged and raises that partner's investment; an instalment-purchased machine's monthly line reduces profit with no partner tag; a cash-purchased machine raises the buying partner's investment and is not an expense.
- Asset constraint tests via the API layer (not just DB): reject an asset submitted as both modes or neither.
- Playwright e2e: create an instalment asset and confirm its expense line appears the following month; create a cash asset and confirm it appears only in the investment statement; recurring monthly-expense pre-fill flow, requiring explicit confirmation before saving.

### Risks
- Auto-generating the instalment monthly-expense line (FR-AST-04) incorrectly — must generate exactly one line per active instalment asset per month, not a stored/duplicated row, and must respect "no month locking" (a past month's already-recorded instalment line is not silently regenerated or altered).
- The recurring-line pre-fill (FR-MEXP-06) accidentally auto-saving instead of requiring confirmation.
- Investment statement double-counting a cash asset or partner-funded expense if the aggregation function from Phase 1 isn't reused consistently.

### Exit criteria
- FR-MEXP-01 to 08, FR-AST-01 to 10, FR-INV-01 to 07, FR-PINC-03 implemented and tested.
- AC-05 (funding-source rule) is demonstrable end-to-end for both daily and monthly expenses and both asset acquisition modes.

### Features that must not be implemented yet
- No results/profit-and-loss calculation screens or dashboard (Phase 5) — entries exist but are not yet summarized into a monthly result view.
- No reports or exports (Phase 5).
- No warnings engine (Phase 5), though the underlying data this phase produces is what Phase 5's warnings will read.
- No offline entry or sync for these screens (Phase 6) — Partner workflows remain online-only until then.
- No master-data admin CRUD or profit-split settings UI (Phase 7) — `app_settings` profit-split value is read here, not edited.

---

## Phase 5 — Calculations, Dashboard, Warnings, and Reports

### Objective
Assemble every entry type recorded so far into the actual monthly result, the dashboard, the warnings engine, and exports — and build the July 2026 reconciliation fixture as the project's permanent, most important regression test.

### Exact SRS requirement groups
- FR-RES-01 to FR-RES-11 (all).
- FR-WARN-01 to FR-WARN-05 (all).
- FR-RPT-01 to FR-RPT-09 (all).
- FR-AUD-04, FR-AUD-05, FR-AUD-06 (change-history viewing — Partner-visible per UC-14, delivered here alongside the other Partner-facing analytical views).
- NFR-MNT-06 (result-calculation test coverage, including funding-source rules and the July 2026 fixture).
- NFR-PERF-04, NFR-PERF-05.
- AC-02, AC-08 (full and final verification), AC-09, AC-10, AC-13 (fixed here — previously missing from this header list, see `docs/REQUIREMENTS_TRACEABILITY.md`'s gap notes item 5).
- UC-10, UC-12, UC-13, UC-14, UC-18, UC-21.

### Deliverables
- Monthly summary / results screen: date range defaulting to the current calendar month, one-action step to previous/next month (FR-RES-02/03), itemised breakdown laid out in the same shape as the existing workbook (FR-RES-09/10), profit split applied from `app_settings` and shown per partner including for a loss (FR-RES-08).
- Dashboard: current vs previous month (FR-RPT-01), outstanding warnings, and (placeholder until Phase 6) pending-upload count (FR-RPT-02).
- Warnings engine: recurring categories missing this month (FR-WARN-01), active instalment assets missing this month's line (FR-WARN-02), non-blocking presentation on the dashboard (FR-WARN-03), marked variance from the previous month (FR-WARN-04, should), per-month dismissal (FR-WARN-05, should).
- Reports: income/expense trend across recent months (FR-RPT-03), expenses by category marking partner-funded lines (FR-RPT-04), income by party (FR-RPT-05).
- Exports: PDF formatted for A4 in the existing sheet's shape (FR-RPT-06), Excel with one sheet per data type (FR-RPT-07), every export stamped with date produced, range covered, and producing user (FR-RPT-08).
- Change-history browsing: read-only, filterable list by user/date/record type (FR-AUD-04), per-record history view (FR-AUD-05), highlighting of edits to entries over a month old (FR-AUD-06, should).
- Server-side withholding of every one of the above from `OPERATOR` (FR-RPT-09, FR-AUTH-04, NFR-SEC-04) — this is where AC-08 is closed out completely, since this is the first phase where every financial endpoint exists to test against.
- **The July 2026 reconciliation fixture** (`/tests/fixtures`) and its Vitest test against the `src/lib/domain` result calculation, asserting exactly: income Rs 1,495,535; expenses Rs 1,295,459; profit Rs 200,076; Rs 100,038 to each partner; daily-expense component Rs 171,190; daily-billing party income Rs 225,650.

### Tests
- **The AC-02 fixture test itself** — the single most important regression test in the codebase, per `CLAUDE.md` §21.
- AC-09: date range demonstrated across a calendar-month boundary and over an arbitrary custom range.
- AC-10: a missing recurring bill and a missing instalment line are both correctly flagged.
- AC-13: PDF and Excel export content verified line-by-line against the underlying entries.
- AC-08 full sweep: an automated test attempts every financial endpoint/report as an `OPERATOR` session and confirms all are refused server-side.
- NFR-PERF-04/05: result calculation and export timing measured against their stated limits.

### Risks
- **Resolved (was a blocking risk):** per `CLAUDE.md` §27 item 1, Appendix A's initial data (as loaded in Phase 1) sums to Rs 1,287,459 in expenses, not the Rs 1,295,459 AC-02's prose requires, because the corrected single `AT WASTE` line removes a duplicate Rs 8,000 that the *target* figures still included. **Approved resolution (`docs/adr/0007-...md` §1):** the permanent reconciliation fixture reproduces the corrected figures (Rs 1,287,459 expenses / Rs 208,076 profit / Rs 104,038 per partner) rather than AC-02's own uncorrected prose, since SRS §11.3 calls the duplicate line an error.
- Decimal-precision edge cases when the profit split isn't an even 50/50 — covered by Phase 1's existing `splitProfit` unit tests (unchanged, reconfirmed correct here), not re-litigated in Phase 5.
- PDF layout fidelity to the original A4 workbook shape — delivered as a functional one-pager matching the workbook's section order (Income/Administration/Purchasing/Net Result/Split); pixel-exact layout matching was not a stated requirement and was not pursued beyond that.
- Performance with realistic multi-year data volumes (NFR-PERF-06) is only partially testable here (NFR-PERF-04/05 specifically, proven against a real 3-year synthetic dataset); full-scope screen-by-screen testing is completed in Phase 8.
- **Found during implementation, fixed before phase completion (not a residual risk):** an early version of the Administration/Purchasing breakdown summed only Business-funded rows per category, meaning a category with only partner-funded spending never appeared at all — a direct contradiction of BR-07/FR-RES-06. Fixed to show a separately-tagged partner-funded line alongside any business-funded line for the same category, in the Monthly Summary screen, PDF, and Excel Summary sheet alike (`docs/adr/0007-...md` §12).

### Exit criteria
- The July 2026 fixture test passes and is committed as a permanent regression guard, built against the corrected figures per the approved AT WASTE resolution above.
- AC-02, AC-08, AC-09, AC-10, AC-13 all demonstrated.
- FR-RES-01 to 11, FR-RPT-01 to 09, FR-AUD-04 to 06 implemented and tested. FR-WARN-01 to 04 implemented and tested; **FR-WARN-05 deferred** (approved, `docs/adr/0007-...md` §5 — needs new per-user/per-month dismissal state, out of this phase's data-model scope).

### Features that must not be implemented yet
- No offline entry, PWA installability, or sync (Phase 6) — the Dashboard shows no pending-upload count at all yet (never a fabricated/placeholder figure, matching Phase 3B's established precedent), and "provisional figures while offline" (FR-OFF-12) does not apply yet since there is no offline mode.
- No master-data admin CRUD or profit-split settings **editing** UI (Phase 7) — the split is read from `app_settings`, not configured here; the one Admin-only action this phase adds is the narrow, write-once initial Partner A/B mapping (FR-RES-08), never a re-mapping/percentage-editing screen.
- No historical Excel import (Phase 7).
- No production deployment, backup/restore rehearsal, or handover documentation (Phase 8).

### Status

**Implemented and closed.** See `docs/adr/0007-phase-5-calculations-dashboard-reports.md` for the full design record — the approved resolution of the AT WASTE reconciliation conflict (the permanent fixture reproduces the corrected, single-AT-WASTE figures), the explicit `partner_a_user_id`/`partner_b_user_id` FK mapping (never account-creation order), the approved variance-warning formula, the plain SVG/CSS trend chart (no charting library), the Decimal→Excel-number export safety boundary and formula-injection protection, defensive recursive audit redaction, keyset Audit Log pagination, and the exact dependency versions (`pdfkit@0.19.1`, `@types/pdfkit@0.17.6`, `exceljs@4.4.0`) plus the `next.config.ts` `serverExternalPackages` fix pdfkit needed under Next.js's default bundling. Two genuine correctness/completeness issues were found and fixed, not merely documented: an early version of the Administration/Purchasing breakdown excluded partner-funded categories entirely, contradicting BR-07/FR-RES-06 (ADR-0007 §12); and FR-RPT-05 ("income by party across a chosen range") was initially disclosed as a gap rather than built — closed out at Phase 5's closure pass with a real screen and query (ADR-0007 §14), which also completes FR-PINC-08's own "arbitrary range" gap. FR-AUD-06's `null`-for-asset/capital-contribution limitation was likewise closed via a batched live-row lookup (ADR-0007 §13). Only **FR-WARN-05** (per-month warning dismissal) remains deferred — it needs new persisted per-user/per-month state outside this phase's approved data-model scope, an explicit approved decision, not an oversight. See `docs/REQUIREMENTS_TRACEABILITY.md` for the row-by-row detail.

---

## Phase 6 — Offline Operation and Synchronization

### Objective
Deliver the single most technically demanding requirement in the specification (SRS §3.10): full offline entry for the four synchronizable entry types, automatic and manual upload, guaranteed-safe idempotent retry via the `client_uuid` established in Phase 1, and conflict handling that never silently discards data.

**Offline synchronization is implemented only in this phase — no earlier phase builds any part of the offline queue, PWA shell, or sync client.**

### Exact SRS requirement groups
- FR-OFF-01 to FR-OFF-14 (all).
- FR-AUD-08 (capture time and upload time recorded for offline-created entries).
- NFR-REL-05, NFR-MNT-07, NFR-PERF-07, NFR-SEC-09.
- AC-06, AC-07.
- UC-01 (offline-aware sign-out warning), UC-20.

### Deliverables
- Progressive Web App shell: installable, loads without a network connection once installed (FR-OFF-01).
- Dexie-backed local queue mirroring `daily_expenses`, `monthly_expenses`, `party_income`, `counter_income`, each entry assigned its `client_uuid` on the device at creation, before any network call (FR-OFF-02, FR-OFF-06 — the column itself already exists from Phase 1; this phase is where it is actually generated and used client-side).
- Visible connection-state and pending-upload-count indicator on every screen (FR-OFF-03).
- Automatic upload on connection return, plus a manual "upload now" control (FR-OFF-04, FR-OFF-05).
- Server-side idempotency: repeated upload of the same `client_uuid` is recognized and ignored, never creating a duplicate (DR-05, AC-07).
- Upload ordering by capture time (FR-OFF-07).
- Conflict handling: where the same record was changed both on a device and on the server, both versions are kept and presented to the user to choose — neither is discarded automatically (FR-OFF-08).
- Entries persist on the device indefinitely until uploaded or explicitly discarded by the user, surviving a browser close/reopen or device restart (FR-OFF-09, NFR-REL-05).
- A warning before any action — including sign-out — that would discard entries not yet uploaded (FR-OFF-10, FR-AUTH-09).
- Both `captured_at` (device time) and `synced_at` (server time) recorded per entry and in its audit-log entry (FR-OFF-11, FR-AUD-08, DR-02).
- Figures shown while offline are visibly marked provisional (FR-OFF-12).
- Reports and exports require a connection and are unavailable offline (FR-OFF-13).
- The most recent 90 days of entries readable offline (FR-OFF-14, should).
- Device-held offline data cleared on sign-out once nothing is pending (NFR-SEC-09).
- `/docs/offline-sync.md` documenting the conflict-resolution strategy, backed by an ADR (`CLAUDE.md` §23).

### Tests
- **AC-06 end-to-end:** disable the network, make several entries across more than one entry type, close and reopen the browser, restore the connection, confirm every entry uploads exactly once.
- **AC-07:** deliberately resend an already-uploaded `client_uuid` and confirm no duplicate row is created.
- NFR-MNT-07: automated tests specifically for conflict handling (both-changed scenario) and for repeated-upload safety.
- NFR-PERF-07: 200 entries queued offline upload within 30 seconds once reconnected.
- Playwright: PWA install flow, offline-mode simulation, sign-out-with-pending-entries warning.

### Risks
- This is explicitly flagged in the SRS as the highest-risk, most technically demanding area — browser storage quirks, service-worker cache invalidation, and background-sync API inconsistencies across browsers/devices are all real risks to budget time for.
- Conflict-resolution UX is easy to get functionally correct but confusing for reception staff under time pressure; must be validated with an actual walkthrough, not just automated tests.
- Ensuring "reports require a connection" (FR-OFF-13) doesn't accidentally also block already-cached read-only entry views that Phase 6 is supposed to keep available (FR-OFF-14).

### Exit criteria
- FR-OFF-01 to 14 implemented and tested.
- AC-06 and AC-07 demonstrated.
- `/docs/offline-sync.md` written and the corresponding ADR recorded.

### Features that must not be implemented yet
- No master-data admin CRUD or profit-split settings UI (Phase 7).
- No historical Excel import (Phase 7).
- No production deployment, backup/restore rehearsal, or handover documentation (Phase 8).

### Status

**Implemented and closed.** See `docs/adr/0008-phase-6-offline-sync.md` for the full design record and `docs/offline-sync.md` for the architecture note. Dependencies: exactly `dexie@4.4.5` and `dexie-react-hooks@4.4.0`, per the approved plan — no other new dependency. The migration (`20260822070612_phase6_offline_sync`) adds the `sync_operations` receipt table and backfills `synced_at` for pre-existing rows (`audit_log` excluded, since its append-only trigger correctly rejects `UPDATE`); a pre-existing, unrelated migration-history checksum-bookkeeping issue on Phase 5's `phase5_partner_mapping` migration was found and repaired (non-destructively — no reset, no data loss) before this migration was generated, also recorded in ADR-0008.

Every mutation function across the four offline-capable entities gained an optional trailing `tx?: Prisma.TransactionClient` parameter (additive, no existing call site changed), which is what makes the business write, its audit row, and the new `sync_operations` receipt commit together in one transaction for every synced operation (mandatory decision #3). The receipt protocol replays a genuine retry's stored result verbatim and rejects a reused `operationId` carrying different content as `OPERATION_ID_REUSED`; a genuine version conflict is distinguished from an ordinary rejection by re-reading the current row inside the same transaction. The service worker is static and dependency-free, versions its cache, never caches anything under `/api/` or any page's server-rendered HTML except one static `/offline` fallback, and treats Background Sync strictly as an enhancement (a postMessage hint, never the dependable sync path — that is `OfflineProvider`'s own startup/focus/visibilitychange/`online` listeners, each re-verifying a real authenticated connection via `/api/sync/ping` rather than trusting `navigator.onLine`).

Writing the offline Playwright suite against the real running app surfaced and fixed three genuine bugs, none of them test-only: `OfflineProvider` closing its Dexie connection on every unmount (React StrictMode's double-invoke turned this into a `DatabaseClosedError` silently swallowing offline saves — fixed by removing the close, since per-user isolation was already handled by `getOfflineDb`'s own user-id-change check); a hydration mismatch from reading `navigator.onLine` synchronously as `useState`'s initial value (fixed with `useSyncExternalStore`); and the sidebar using a plain `<a>` instead of `next/link`'s `<Link>`, which forced a full hard page reload on every in-app navigation and made offline navigation impossible (fixed by switching to `<Link>` — a real, appropriately-scoped fix, not a workaround). The offline-queued path for Counter Income/Monthly Expense's non-blocking duplicate-warning flow (FR-CINC-04/FR-MEXP-08) now always proceeds as confirmed when queued offline, since there is no live round trip to check against and no user left to prompt by sync time.

**Closure pass (post-review):** two items initially disclosed as approved-scope gaps were built, and a real offline-navigation dead end was replaced with a working page, rather than leaving all three disclosed indefinitely. FR-OFF-12 (provisional totals) — `src/lib/offline/relevance.ts` plus `ProvisionalNotice`/`ProvisionalTotalsWrapper`, wired into the Partner Dashboard and Monthly Summary, unit- and e2e-tested. NFR-SEC-09 (offline data cleared on sign-out once nothing is pending) — `clearOfflineDataIfQueueEmpty`/`deleteOfflineDatabase`, re-checking the real IndexedDB queue before ever deleting anything, wired into `UserMenu.tsx`'s sign-out, e2e-tested both ways (empty queue clears; "Sign out anyway" with something queued never does). A genuine Offline Entry Workspace (`/offline-entry`) — a static, unauthenticated page hosting all four entry workflows off this device's own cached reference data — replaces the plain `/offline` dead end as the service worker's navigation fallback, so reopening the installed app with zero connectivity reaches something the user can act on; one residual case is disclosed (the workspace's own JS chunk isn't eagerly precached, only its HTML — full interactivity on a device's genuinely first-ever offline visit to this one page, before loading any other authenticated page, isn't guaranteed, though it is guaranteed and tested once the device has been online at least once). The same closure pass root-caused (not merely retried around) a flaky Playwright test: `context.setOffline(true)` was being called before a preceding navigation's own in-flight requests had settled, stalling later actions — fixed with `page.waitForLoadState("networkidle")` immediately beforehand. See `docs/REQUIREMENTS_TRACEABILITY.md` and ADR-0008 decision 11 for the row-by-row and full reasoning.

---

## Phase 7 — Administration and Historical Import

### Objective
Give Admins control over master data, users, and the profit split, and deliver the one-time historical data import pipeline.

### Exact SRS requirement groups
- FR-MST-01 to FR-MST-07 (all).
- FR-AUTH-03 (user management scope, specifically the Admin capability to manage accounts).
- FR-IMP-01 to FR-IMP-04 (all).
- UC-15, UC-16, UC-17.

### Deliverables
- `src/app/(admin)` master-list management: parties (with billing-mode assignment), expense items, expense categories (marked recurring or not), vendors — add, rename, archive only, never delete (FR-MST-01 to 05).
- User management: create/deactivate Operator, Partner, and Admin accounts (`is_active` toggle, never a hard delete of a user record).
- Profit-split settings screen enforcing the two percentages sum to exactly 100 (FR-MST-06).
- Historical data import: a defined Excel template (FR-IMP-01), upload-and-preview with validation errors marked before anything is saved (FR-IMP-02), all-or-nothing import — any failing row rejects the whole file (FR-IMP-03), imported records flagged as historical imports in the audit log (FR-IMP-04).

**Status: implemented**, with six mandatory corrections applied before the draft plan was approved for implementation — see `docs/adr/0009-phase-7-administration-and-import.md` for the full design record. The import-session claim is a standalone, already-committed `updateMany` issued *before* the business transaction opens, so a later rollback can never make a claimed session silently reusable (proven under real concurrency — two simultaneous commit attempts against one session, exactly one succeeds). A durable `ImportBatch` record (file hash, actor, status, row counts, delete-protected like every other business/audit table) is separate from the ephemeral `ImportSession` (the actual workbook bytes, 15-minute expiry, nulled on every terminal path — never queried as the primary idempotency mechanism). Commit always reparses the claimed session's own stored bytes from scratch and rejects cleanly with zero rows written if anything changed since preview (an archived reference, for example). Master-data name uniqueness is a Postgres functional index on `lower(btrim(name))`, with a migration preflight that fails clearly on any pre-existing normalized duplicate. The last-active-Admin protection is one database trigger covering both deactivation and role downgrade, made concurrency-safe via `SELECT ... FOR UPDATE` row locking rather than a count-then-update race; a second trigger blocks removing partner status from a mapped Partner A/B; a third revokes every session on any role/partner/active-status change, from any code path. Profit-split percentages moved from a JSON blob to typed `Decimal` columns, backfilled and preflight-checked before a `CHECK` constraint (non-null, in-range, summing to exactly 100) was added; the settings form discloses plainly that a change affects every period's *live* calculation immediately, including months already reported, since no result is ever stored (DR-09). No new dependency was installed — `exceljs` (already used for Phase 5's report exports) is reused for reading the import workbook. Writing the Playwright suite against the real running app caught one genuine UI bug: `MasterDataManager`'s "Add {entity}" button derived its singular label by stripping a trailing "s", which breaks for "Parties" → "Partie" and "Expense Categories" → "Categorie" — fixed with an explicit `itemLabel` prop per entity rather than a smarter regex. **Playwright status**: 83/85 passed on the run that found that bug; after the fix, two further full-suite attempts were disrupted by sandbox infrastructure (a Postgres outage, then an unresponsive dev server) unrelated to the code itself, and a third attempt was not made per instruction — see `docs/testing.md`'s Phase 7 section for the full disclosure. Every non-Playwright validation command (`typecheck`, `lint`, `format:check`, `prisma validate`/`format`/`migrate status`, `test`, `build`) passed cleanly on the final code state.

### Tests
- Archive tests confirming a renamed/archived party, item, category, or vendor never alters a figure already recorded against it (CON-05, BR-14, DR-06) — this is a hard constraint and must be proven, not assumed, given how central it is to the system's integrity.
- Profit-split validation: rejects any submission where the two percentages don't sum to 100.
- Import pipeline tests: a fully valid file imports cleanly; a file with one invalid row rejects the entire import with no partial write; imported rows are visibly tagged as historical in the audit log.
- Playwright e2e: an Admin walkthrough covering master-list edits, a user deactivation, a profit-split change, and a historical import — contributing toward AC-14.

### Risks
- Import validation complexity for a multi-sheet Excel template — the all-or-nothing rule (FR-IMP-03) must be implemented as a single transaction, not a best-effort loop with manual rollback.
- A profit-split change must only affect future views of the result, since no result is ever stored (DR-09) — confirm this is naturally satisfied by always applying the *current* `app_settings` value at calculation time, and flag to the client if retroactive/historical split versioning is ever expected (the SRS does not currently specify this; do not invent it).
- Ensuring "archive" in the admin UI never becomes a UI affordance that reads as "delete" to the Admin, given how much historical integrity depends on it (CON-04).

### Exit criteria
- FR-MST-01 to 07, FR-IMP-01 to 04 implemented and tested.
- An Admin end-to-end walkthrough (master data, users, profit split, import) completes without assistance.

### Features that must not be implemented yet
- No production deployment, backup/restore rehearsal, cross-browser/device compatibility pass, or handover documentation (Phase 8).
- No new business features beyond what SRS §3.11/§3.14 and this phase's requirement groups specify — in particular, do not build instalment end dates, depreciation, or any other item from the out-of-scope list (`CLAUDE.md` §26) under cover of "admin flexibility."

---

## Phase 8 — Acceptance Testing, Deployment, and Handover

**Split into 8A and 8B.** 8A (internal acceptance and release hardening)
is **implemented** — see `docs/adr/0010-phase-8a-release-hardening.md`.
8B (deployment, backup/restore rehearsal, real-device verification, and
client-facing UAT) is **not started**.

**Phase 8A — locally achievable work delivered.** Security headers plus an
enforced nonce-based CSP via Next 16's `proxy.ts`, with non-browser policy
coverage and preserved browser coverage. Generic error
handling completed (`global-error.tsx`, a root `not-found.tsx`, and an
`(auth)` boundary — the three that were genuinely missing; `(app)`'s two
already existed and already leaked nothing). Host-native structured JSON
logging with redaction and Next's global `onRequestError` hook. A health
check that actually reaches Postgres,
bounded by a timeout. Bounded, cleanup-aware per-user rate limiting,
documented as single-instance-only. Import sessions scoped to their
uploader; import preview authorizes, size-checks, and rate-limits before
multipart parsing. The three archive paths that had no confirmation at all now
confirm by name — the grid inline rather than modal, so NFR-USE-02's
keyboard operation survives. FR-RPT-02's pending-upload count. An explicit
58-function protected-surface registry driving an execution-based
authorization sweep, plus a preserved Playwright sweep over every route.
Accessibility, responsive, and cross-engine suites were added, with the
six unresolved findings stated below. NFR-PERF-06 query-path coverage and
NFR-PERF-07 measured, and a
clean-database migration and seed rehearsal that creates and drops its own
temporary database. Documentation: security review, deployment runbook
draft, handover draft, change-request log, SRS open questions, ADR-0010,
and the two SRS §10 user guides as actual PDFs.

**Phase 8A — outstanding.** The accessibility suite added this phase
reports serious/critical violations on the authenticated screens, and the
responsive check finds horizontal scroll on the data screens; two
compatibility-smoke tests also fail. None is fixed, none is skipped, and
the findings are recorded in `docs/testing.md`. **NFR-USE-07 and the
accessibility bar are not met**, and their traceability rows must be
re-checked once the axe detail is root-caused.

**Phase 8A — deliberately not asserted.** NFR-PERF-01/02/03 are
browser-timing budgets that need a production build; measuring them under
`next dev` would record a number that does not mean what it appears to.
Carried to 8B.

**Phase 8B — remaining, all environment- or client-dependent.** Production
deployment and hosting choice (needs an ADR); automated backups, retention,
and a rehearsed restore (NFR-REL-01/02/03, AC-12); alerting and uptime
monitoring (NFR-REL-06/07); HTTP→HTTPS redirect and encryption at rest
(NFR-SEC-01/02); real-device browser verification (NFR-CMP-02) and
Excel/Google Sheets export verification (NFR-CMP-03); two further
historical months reconciled against the client's workbooks (AC-03);
unaided walkthroughs by both partners and one operator (AC-14); and the
two open questions in `docs/SRS-open-questions.md`.

### Objective
Verify every acceptance criterion end to end, deploy to production, rehearse recovery, and hand over full documentation — closing out the project per SRS §12/§13.

### Exact SRS requirement groups
- AC-01 to AC-15 (all, full and final verification).
- NFR-PERF-01 to NFR-PERF-07 (all).
- NFR-SEC-01 to NFR-SEC-10 (all).
- NFR-REL-01 to NFR-REL-07 (all).
- NFR-MNT-01 to NFR-MNT-09 (all).
- NFR-CMP-01 to NFR-CMP-03 (all).
- SRS §10 Documentation Deliverables (finalized, not skeleton).
- SRS §12 Change Control, §13 Sign-Off.
- Appendix A final data load verification against production.

### Deliverables
- Production deployment, cloud-hosted, with hosting cost kept to a minimum per CON-02.
- Automated backups at least every 24 hours, retained at least 30 days with one monthly backup retained 12 months (NFR-REL-01/02).
- A tested, documented backup-restore procedure, rehearsed into a clean environment (NFR-REL-03, AC-12).
- Application error monitoring with enough context to diagnose issues (NFR-REL-06).
- `/docs/deployment.md` finalized as a full runbook covering deployment, rollback, and backup restoration (NFR-MNT-04).
- Every `/docs` deliverable finalized: `architecture.md`, `offline-sync.md`, `testing.md`, README, `.env.example`, all ADRs, `CHANGELOG.md`, the change-request log, the handover document (accounts, domain, hosting, renewal dates — passwords only ever in a password manager, never in a document), and one-page user guides for Operators and Partners (SRS §10).
- At least two further historical months reconciled line by line against the client's workbooks, beyond July 2026 (AC-03).
- Cross-browser/device compatibility verified: current and previous major Chrome/Edge/Firefox/Safari, Android 10+, iOS 15+, Excel exports opening correctly in Excel 2016+ and Google Sheets (NFR-CMP-01 to 03).

### Tests
- Full AC-01 to AC-15 checklist executed and recorded as the formal acceptance record.
- AC-12: restore from an actual backup into a clean environment, demonstrated live.
- AC-14: both partners and at least one reception operator complete an unaided walkthrough of their routine tasks.
- Security pass across NFR-SEC-01 to 10: HTTPS-only with permanent redirect, encryption at rest, generic error messages with no stack traces or internal paths (NFR-SEC-10), OWASP Top 10 posture reviewed (NFR-SEC-06).
- Performance sanity check at realistic multi-year data volume against NFR-PERF-01 to 07, especially NFR-PERF-06 (screens remain within limits with three years of accumulated data).

### Risks
- Backup/restore rehearsal is exactly the kind of check that surfaces late-discovered gaps — budget real time for it, don't treat it as a formality.
- AC-03's two additional historical months could surface another reconciliation mismatch similar to the AT WASTE issue found in Phase 5's planning — if so, treat it identically: raise it with the client, do not silently adjust the fixture or the target to make it pass.
- Hosting-tier choice creeping past CON-02's "kept to a minimum" instruction if sized for headroom rather than the SRS §4.1 sizing basis (a small-data system).

### Exit criteria
- Every AC-01 to AC-15 demonstrated and signed off per SRS §13.
- Production is live, backed up, and monitored.
- All documentation deliverables in SRS §10 are complete and handed over.

### Features that must not be implemented yet
- Nothing from `CLAUDE.md` §26's out-of-scope list is built at any point in this plan without a client-approved Change Request per SRS §12: payroll, bank integration, payment gateways, patient registration, diagnostic results, tax filing, accounting-package integration, asset depreciation, instalment end dates/outstanding balances, month closing/locking, capital/running-cost separation, partner reimbursement/settlement transfers, multiple currencies, multiple branches, native mobile apps, or an Urdu interface.
