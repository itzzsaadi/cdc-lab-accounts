# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — Phase 4: Monthly Expenses, Assets, and Partner Investment

- `assets.default_category_id` and the extended `assets_acquisition_mode_check`
  (requires it for `INSTALMENT`, forbids it for `CASH`), plus the
  `party_income_active_monthly_party_month_unique` partial unique index
  with a preflight duplicate guard — one additive migration
  (`20260821170513_phase4_monthly_assets_investment`), no earlier
  migration touched, no `prisma db push`.
- Monthly Expenses (`src/app/(app)/(partner)/monthly-expenses`):
  Administration/Purchasing sections, a read-only system-generated Daily
  Expenses line, same-category duplicate warning, and two batch actions —
  Partner-triggered/previewed/confirmed instalment-line generation
  (`generateInstalmentLines`) and recurring-line pre-fill
  (`applyRecurringPrefill`), each creating one row per asset/category in
  its own transaction with its own audit event, concurrency-proven
  idempotent via the Phase 1 partial unique index.
- Asset Register (`src/app/(app)/(partner)/assets`): Cash/Instalment
  acquisition-mode toggle, mutually exclusive at form, Zod, and DB
  layers; Cash mode requires a purchasing partner as part of the same
  required field, never an optional checkbox; Instalment mode requires a
  positive monthly instalment and an active Purchasing default category
  (server-validated); filterable by classification/mode/status with a
  Cash purchase-price total; archiving stops future instalment
  generation only.
- Monthly Party Bill (`src/app/(app)/(partner)/party-income-monthly`,
  new `party-income:monthly-bill` permission): one figure per
  monthly-billing party per month, DB-enforced; completes FR-PINC-07/08's
  three-way total (daily + monthly + cash receipts) via the new
  `getPartyMonthlyTotals` query.
- Partner Investment (`src/app/(app)/(partner)/investment`): Capital
  Contribution/Drawing entry (amount always positive `Decimal`,
  `contributionType` conveys the sign) and a per-partner itemised
  statement with running balance, reusing the unchanged Phase 1
  `partnerInvestmentTotal`.
- Four new Partner-only sidebar entries (`nav-items.ts`) for the above —
  no dashboard, report, or warnings functionality built (explicit
  approved scope decision; those remain Phase 5).
- New tests: `tests/integration/mutations/{monthly-expenses,assets,
capital-contributions}.test.ts`, `tests/integration/constraints/
party-income-monthly-unique.test.ts`, `tests/integration/queries/
{party-monthly-totals,capital-contributions}.test.ts`,
  `tests/unit/validation/{monthly-expense,asset,capital-contribution}.test.ts`,
  `tests/e2e/monthly-workflows.spec.ts`. Full suite: 298 Vitest tests
  across 48 files, 44 Playwright e2e tests.
- See `docs/adr/0006-phase-4-monthly-assets-investment.md` for the full
  design record.

### Added — Phase 3B closure: filters, edit/archive UI, and money formatting

- `src/lib/domain/money-format.ts` (`formatMoney`): one shared,
  Decimal-safe display formatter (`"Rs 1,234.56"`, thousands separators,
  always two decimals; pure string manipulation, never `Number()`/
  `parseFloat`/`.toNumber()`), applied across Daily Expenses, Party
  Income (grid totals, Cash Receipt confirmation), Counter Income (list,
  total, duplicate warning), and Operator Home's Recent Entries.
- Daily Expenses filter controls (`src/app/(app)/(operator)/
daily-expenses/page.tsx`): date range, item-or-description search, and
  funding source, all reflected in the URL query string and validated
  server-side (`listDailyExpensesSchema`); a Reset Filters action; a
  filter-aware empty state.
- Daily Expense edit/archive UI (`src/components/entries/
{DailyExpenseFormFields,DailyExpenseRowActions}.tsx`): edit opens a
  dialog prefilled from the row's own values and submits its
  `expectedUpdatedAt` for the existing atomic conditional-write check;
  archive reuses the confirmation `Modal`, naming the exact record; a
  stale edit/archive shows a clear reload message rather than silently
  failing.
- Cash Receipt's confirmation now shows a visible "amount recorded for
  &lt;party&gt;" state before closing (NFR-USE-04), and its reachability
  from both Operator Home and the Party Income page is now e2e-proven.
- Fixed a Turbopack crash on `/party-income`: `formatMoney`'s first
  version transitively imported the generated Prisma client (a Node-only
  module) into two Client Components' browser bundles. The `Decimal`
  import is now type-only; see `docs/adr/0005-phase-3b-operator-
workflows.md` §13.
- New tests: `tests/unit/domain/money-format.test.ts`; a Cash Receipt
  idempotent-replay/concurrency test in `tests/integration/mutations/
party-income.test.ts`; Playwright coverage in `tests/e2e/entries.spec.ts`
  for filters, the edit/archive/stale-write lifecycle, and Cash Receipt
  (reachability, visible confirmation, `CASH_DIRECT` persistence, one
  audit row) via two new DB-check helper scripts
  (`scripts/e2e-verify-party-income-row.ts`,
  `scripts/e2e-touch-daily-expense.ts`) following the existing
  `scripts/e2e-create-user.ts` child-process pattern.

### Added — Phase 3B: Operator Transaction Workflows

- `src/app/(app)/(operator)/daily-expenses/page.tsx` +
  `src/components/entries/DailyExpenseDrawer.tsx`: Daily Expense list
  (current month, date/item/amount/funding-source) and a native-`<dialog>`
  create drawer — item selectable from the active managed list or "Other"
  free text, Business/Partner funding-source toggle with a required
  partner selector when Partner is chosen (DR-07).
- `src/app/(app)/(operator)/party-income/page.tsx` +
  `src/components/entries/{PartyIncomeGrid,GridCellInput,CashReceiptModal}.tsx`:
  the daily-billing party income grid — sticky day column, horizontal
  scroll, one column per active daily-billing party (plus any archived
  party with in-month history, rendered read-only) — and a direct Cash
  Receipt modal (`receipt_type: "CASH_DIRECT"`, required note, any billing
  mode). Each cell is a full autosave state machine (idle/dirty/saving/
  saved/error/stale) with Enter-to-move-down and caret-gated arrow-key
  navigation across the grid.
- `src/app/(app)/(operator)/counter-income/page.tsx` +
  `src/components/entries/CounterIncomeForm.tsx`: daily counter-income
  list/total plus a create form implementing FR-CINC-04's two-step,
  non-blocking duplicate-date warning ("Record Anyway" resubmits with the
  same `client_uuid`, never a hard rejection). `counter_income.amount`
  allows zero — the one table with `CHECK (amount >= 0)`.
- `src/app/(app)/(operator)/home/page.tsx`: real Quick Actions (Add Daily
  Expense / Enter Party Income / Add Counter Income / Record Cash Receipt)
  and a real Recent Entries table (`captured_at DESC, id DESC` across all
  four entry kinds) — replaces the Phase 2 placeholder. No "Pending
  Uploads" tile, no per-row sync status — both would fabricate state that
  doesn't exist until Phase 6's offline queue.
- `src/lib/domain/calendar-date.ts`: strict `YYYY-MM-DD`/`YYYY-MM` parsing
  (round-trip validated via `Date.UTC`, never `z.coerce.date()`) and
  Asia/Karachi "today"/month-boundary helpers via
  `Intl.DateTimeFormat(...).formatToParts()` — never `.format()`, whose
  output shape isn't part of the stable `Intl` contract.
- `src/lib/validation/{money,daily-expense,party-income,counter-income}.ts`:
  Zod schemas for every Phase 3B write — amounts as regex-validated
  decimal strings (never `z.coerce.number()`), dates via the calendar-date
  parser, `client_uuid` required on every create.
- `src/lib/audit.ts` (`appendBusinessAudit`): the business/financial
  counterpart to Phase 2's `appendAuthAudit`, accepting **only**
  `Prisma.TransactionClient` so every audit write commits or rolls back
  atomically with its business mutation.
- `src/lib/prisma-errors.ts` (`isUniqueConstraintViolationOn`): identifies
  which unique constraint a P2002 violation came from (via the Prisma 7
  driver-adapter error's own `constraint.fields`) — the mechanism behind
  concurrent-safe create-idempotency (client-generated `client_uuid`,
  the database's own constraint as the final authority under real
  concurrency, never `findUnique`-then-`create` alone).
- `src/server/mutations/{daily-expenses,party-income,counter-income}.ts` +
  thin `src/server/actions/*.ts` wrappers: framework-independent mutation
  cores (testable directly against a real database, no Next.js request
  context needed) implementing create-idempotency, atomic
  conditional-write stale-write protection (`updateMany` gated on
  `id`/`expectedUpdatedAt`/`isArchived`), and transactional auditing.
- `src/server/queries/{daily-expenses,party-income,counter-income,home}.ts`:
  read-side queries, including the grid's archived-party-with-history
  visibility rule and its per-party/per-day/grand totals.
- `prisma/migrations/20260821070503_phase3b_party_income_daily_cell_unique/`:
  additive migration adding `party_income_active_daily_cell_unique`
  (mirrors the Phase 1 instalment partial-unique-index pattern), scoped to
  `receipt_type = 'DAILY'` only — preflight-checked for conflicts before
  writing (none found), never touching the Phase 1 migration.
- `docs/adr/0005-phase-3b-operator-workflows.md`: the full design record
  for the above.
- Full test coverage: unit (calendar-date, money/validation schemas),
  integration (business audit atomicity, the new partial unique index,
  every mutation's idempotency/concurrency/stale-write/duplicate-warning
  behavior, the grid query's archived-visibility rule), and Playwright e2e
  (all three new screens, direct-route authorization, updated nav-item
  counts).

### Added — Phase 3A: Shared Application Shell and Reusable UI Foundation

- `src/app/(app)/layout.tsx` + `src/components/layout/AuthenticatedShell.tsx`:
  the shared chrome every authenticated screen now renders through. The
  `(operator)`, `(partner)`, `(admin)` route groups moved one directory
  level deeper, under `(app)`; public route URLs are unchanged (`/home`,
  `/dashboard`, `/users`) — route groups never appear in the URL.
- `src/components/layout/{ShellChrome,Sidebar,Header,UserMenu}.tsx`: fixed
  desktop sidebar, a mobile navigation drawer, and a header (mobile menu
  button, contextual page title, initials avatar, role label, user menu
  with sign-out). No notification bell or sync indicator — both would
  imply functionality that doesn't exist yet; the sync indicator gets real
  state in Phase 6. Both the mobile drawer and the user menu are native
  `<dialog>` elements opened via `showModal()`, so focus-trapping,
  Escape-to-close, and focus-return to the triggering element are all
  browser-native behavior.
- `src/lib/navigation/nav-items.ts`: an **incremental** navigation table —
  only routes that exist today (Home/Dashboard/Users), filtered per role
  by the existing `hasAtLeastRole` rank comparison. Presentational only;
  every page still independently calls `requirePermission`.
- `src/components/ui/{Button,TextInput,Select,Checkbox,Card,Table,Badge,
Alert,Modal,EmptyState,LoadingSkeleton,Avatar}.tsx`: the reusable
  primitive set. `Modal` uses the native `<dialog>` element rather than a
  hand-rolled focus trap. `Avatar` is a neutral, initials-based component
  — no external avatar photo anywhere in the app (approved decision).
- `src/lib/fonts.ts`: Inter and Material Symbols Outlined self-hosted via
  `next/font/local` from vendored, OFL-1.1-licensed `.woff2` files under
  `public/design-assets/fonts/` — no `next/font/google`, no request to
  Google Fonts at build or runtime. Source, version, license, and checksum
  recorded in `public/design-assets/fonts/PROVENANCE.md`.
- `src/app/globals.css`: the complete design-token system (full color
  palette, 8-step typography scale, spacing, radius — `full`/pill reserved
  for avatars/badges only, per the already-approved radius decision) and
  `prefers-reduced-motion` handling.
- The four Phase 2 `(auth)` screens (Sign In, Forgot Password, Reset
  Password, Accept Invitation) retrofitted onto the new `Button`/
  `TextInput`/`Card`/`Alert`/`Checkbox` primitives — a behavior-preserving
  refactor; a session-expired banner (`?expired=1`) added to Sign In,
  shown only when the shell's redirect finds a stale session cookie.
  `/forbidden` restyled onto the shared tokens, deliberately kept outside
  `(app)` (no sidebar for a denied role).
- `tests/unit/navigation/nav-items.test.ts`, `tests/unit/ui/avatar.test.ts`,
  `tests/e2e/shell.spec.ts`: role-specific nav DOM presence/absence,
  direct-URL protection independent of navigation, mobile drawer keyboard/
  focus behavior, user menu/sign-out, skip-navigation, and a zero-external-
  font-request/zero-console-error proof. All pre-existing Phase 2 tests
  (127 Vitest, 9 of 18 Playwright specs) re-verified passing.
- `docs/adr/0004-phase-3a-shared-shell.md`: the design record for the
  route-group restructuring, the native-`<dialog>` mechanism choice, and
  the locally-hosted font decision.

### Added — Phase 2: Authentication and Authorization

- Better Auth integration (`src/lib/auth/config.ts`, `src/server/auth.ts`):
  the Prisma adapter (`@better-auth/prisma-adapter`), email/password
  sign-in with public self-registration disabled, 30-day sessions
  (FR-AUTH-05), 60-minute single-use password-reset tokens (FR-AUTH-06,
  stored hashed via `verification.storeIdentifier: "hashed"`), and no
  admin plugin (hand-built invitation/bootstrap/session-revocation
  instead, to avoid a duplicate `banned`/`is_active` deactivation
  mechanism).
- `prisma/migrations/20260820181038_phase2_auth/`: additive migration
  adding Better Auth's `sessions`/`account`/`verification` tables and five
  new `users` columns (`email_verified`, `image`, `updated_at`,
  `failed_login_count`, `lockout_until`) — the Phase 1 migration is
  untouched.
- `src/lib/auth/invitation.ts`: a two-layer invitation-acceptance
  mechanism — a project-owned, SHA-256-hashed "gate" token (plain Prisma
  rows, never Better Auth's internal adapter) wraps Better Auth's own
  public `requestPasswordReset`/`resetPassword` endpoints for the actual
  credential creation. The gate token is consumed only after credential
  creation fully succeeds (one `prisma.$transaction` with a
  `pg_advisory_xact_lock`), so a transient failure never permanently burns
  a legitimate invitation.
- `src/lib/auth/lockout.ts`: FR-AUTH-07's 10-failure/15-minute account
  lockout via one atomic `UPDATE ... RETURNING`, with a sign-in sequence
  that guarantees a locked or deactivated account's session is deleted
  before any `Set-Cookie` header is ever forwarded to the browser.
- `src/lib/permissions/`: the centralized `requirePermission`
  authorization layer (`roles.ts`, `matrix.ts`, `guard.ts`), called
  identically from every Server Component, Server Action, and Route
  Handler.
- `src/lib/email/`: fail-closed email delivery — SMTP/Nodemailer in
  production (refuses to start with incomplete configuration), a
  git-ignored local file sink in development/test (refuses to run when
  `NODE_ENV=production` regardless of configuration).
- `scripts/bootstrap-admin.ts`: a one-time, TTY-gated first-Admin
  bootstrap command — refuses to run if any `users` row already exists,
  never logs or emails its one-time setup link.
- Sign In screen (`src/app/(auth)/sign-in`) reproducing the approved
  Stitch design as real React components, plus forgot-password,
  reset-password, and accept-invitation pages, and minimal
  Operator/Partner/Admin placeholder routes proving role protection.
- `@better-auth/prisma-adapter@1.7.1`, `nodemailer@9.0.5`,
  `@types/nodemailer@8.0.1` added as exact-pinned dependencies.
- Two new `AuditAction` values: `SESSION_REVOKED`, `ACCOUNT_LOCKED`.
- `docs/adr/0003-phase-2-authentication.md`, recording the full Better
  Auth integration design and every disclosed security decision.

### Added — Phase 1: Database & Domain Foundation

- `prisma/schema.prisma`: the full 13-table SRS business schema (`users`,
  `parties`, `expense_items`, `expense_categories`, `vendors`,
  `daily_expenses`, `monthly_expenses`, `party_income`, `counter_income`,
  `assets`, `capital_contributions`, `audit_log`, `app_settings`), 10
  enums, every relation, exact-`Decimal` money columns, UTC
  `TIMESTAMPTZ` columns, and `client_uuid` on the four offline-capable
  tables.
- One versioned migration (`prisma/migrations/20260820170711_init/`),
  hand-edited to add: monetary `CHECK` constraints; bidirectional
  funding-source exclusivity; asset acquisition-mode mutual exclusivity;
  an instalment partial-unique index (one active row per asset/month);
  partner-eligibility triggers on `funded_by_user_id`,
  `purchased_by_user_id`, and `partner_user_id`; an audit-log append-only
  trigger; and physical-deletion-rejection triggers on all 13 tables.
- `src/lib/domain/`: pure, framework-agnostic functions for the
  funding-source rule, income/expense aggregation, net profit/loss, a
  deterministic profit-split rounding rule, and partner-investment
  aggregation (with `DRAWING` sign handling) — unit-tested with no
  server or database dependency.
- `prisma/seed.ts`: Appendix A master data (parties, expense items,
  expense categories, vendors, default profit split) — deliberately no
  users, no credentials, and no July 2026 transaction amounts.
- `@prisma/adapter-pg`, `pg`, `@types/pg`, and `tsx` added as
  dependencies — Prisma 7 requires an explicit driver adapter to connect
  at runtime, and `tsx` runs the TypeScript seed script.
- Real-PostgreSQL integration/constraint test suite
  (`tests/integration/`), a guarded `TEST_DATABASE_URL`-only test
  database helper, and a GitHub Actions Postgres service in CI.
- `docs/adr/0002-phase-1-schema-clarifications.md`, recording every
  disclosed deviation from SRS §6's literal schema text.

### Added — Phase 0: Repository & Development Foundation

- Next.js (App Router) + TypeScript strict-mode project scaffold under `src/`.
- Tailwind CSS, ESLint, Prettier configured.
- Vitest (one sanity test) and Playwright (one smoke test against the
  placeholder health page) configured.
- Prisma installed with an empty schema (generator + datasource only — no
  business models yet).
- Better Auth and Zod packages installed, unconfigured.
- GitHub Actions CI running the full validation suite.
- Documentation skeletons: `docs/architecture.md`, `docs/offline-sync.md`,
  `docs/deployment.md`, `docs/testing.md`, `docs/adr/0001-technology-stack.md`.
- Placeholder locations for the forthcoming Google Stitch UI handoff:
  `docs/UI_REQUIREMENTS.md`, `docs/ui/screenshots/`, `docs/ui/stitch-export/`,
  `public/design-assets/`, `src/components/ui/`, `src/components/layout/`.
