# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — Phase 6: Offline Operation and Synchronization

- Full offline entry for the four SRS-specified sync entities (Daily
  Expenses, Monthly Expenses, Party Income — daily grid cells, direct
  cash receipts, and monthly party bills — and Counter Income): a
  Dexie-backed per-user IndexedDB queue (`src/lib/offline/{db,queue,
  coalesce,backoff,fingerprint,types}.ts`) with five deterministic
  client-side coalescing rules, capped-exponential-jitter backoff, and
  SHA-256-over-canonical-JSON operation fingerprints.
- `sync_operations` table (migration `20260822070612_phase6_offline_
  sync`) — durable per-operation receipts keyed by a client-generated
  `operationId`: a genuine retry replays its stored result verbatim; a
  reused `operationId` carrying different content is rejected as
  `OPERATION_ID_REUSED`. `synced_at` backfilled for pre-existing rows
  (`audit_log` excluded — its append-only trigger correctly rejects
  `UPDATE`).
- Every mutation function across the four offline entities
  (`src/server/mutations/*.ts`) gained an optional trailing
  `tx?: Prisma.TransactionClient` parameter (additive, no existing call
  site changed) — the business write, its audit row, and the new
  receipt now commit together in one transaction for every synced
  operation.
- `capturedAt`/`syncedAt`: one server timestamp serves both on an
  ordinary online create; an offline upload preserves the device's own
  `capturedAt` and sets `syncedAt` only at server acceptance.
- `HEAD /api/sync/ping` (authenticated, 3s timeout, one retry) verifies
  a real reconnect — never the public health route, never bare
  `navigator.onLine`. `POST /api/sync/upload` (≤50 operations/batch) and
  `GET /api/sync/reference` (the reference-data cache snapshot) round
  out the sync API surface.
- Conflict protocol: a genuine stale write returns
  `{status:"CONFLICT", current, currentVersion}`; Keep Local re-queues
  as a new operation against the server's current version, Keep Server
  only discards the local queue entry — the server row is never touched
  by that choice.
- Receipt retention (`src/server/sync/retention.ts`): a 180-day window,
  Admin-only, a plain callable function meant to be invoked periodically
  rather than wired into a cron this deployment doesn't have yet.
- `public/sw.js`: a static, dependency-free, versioned service worker —
  caches only an explicit static-asset allowlist plus one `/offline`
  fallback page, never anything under `/api/` or any other page's
  server-rendered HTML. Background Sync is registered strictly as an
  enhancement (a postMessage hint to open tabs); `OfflineProvider`'s own
  startup/focus/visibilitychange/`online` listeners are the dependable
  sync trigger.
- `src/components/offline/{OfflineProvider,SyncStatusIndicator,
  SyncCenter}.tsx`: the one place queue/connection state lives, the
  FR-OFF-03 header indicator (now consistent on every screen), and the
  Sync Center (`/sync-center`) — a re-implementation of the approved
  Stitch queue-list + Local/Server split-comparison layout with real
  entity data, never the handoff's Calibration/Next-Due-Date demo
  content.
- Sign-out warning (`UserMenu.tsx`, FR-AUTH-09) and a `beforeunload`
  prompt (FR-OFF-10) when anything is pending/failed/conflicted —
  neither ever erases the local queue; both are heads-ups, not
  destructive-action prompts.
- PWA manifest and icons (`app/manifest.ts`, `app/icon.tsx`,
  `app/apple-icon.tsx`, `app/manifest-icons/*`) generated with
  `next/og`'s `ImageResponse` (bundled with Next.js, no new dependency)
  from the existing approved sidebar brand mark — never placeholder art.
- Exact dependencies: `dexie@4.4.5`, `dexie-react-hooks@4.4.0` — no
  other new dependency.
- Three real, non-test-only bugs found while writing the offline
  Playwright suite and fixed: `OfflineProvider` closing its Dexie
  connection on every unmount (React StrictMode's double-invoke turned
  this into a silent `DatabaseClosedError` swallowing offline saves); a
  hydration mismatch from reading `navigator.onLine` synchronously as
  `useState`'s initial value (fixed with `useSyncExternalStore`); and
  the sidebar using a plain `<a>` instead of `next/link`'s `<Link>`,
  which forced a full page reload on every in-app navigation and made
  offline navigation impossible.
- A pre-existing, unrelated migration-history checksum-bookkeeping issue
  on Phase 5's `phase5_partner_mapping` migration was found and repaired
  non-destructively (no reset, no data loss) before the Phase 6
  migration was generated — see `docs/adr/0008-phase-6-offline-sync.md`.
- **Disclosed, approved-scope gaps**: FR-OFF-12 (mark figures
  provisional while offline uploads are pending) is not built this
  phase. NFR-SEC-09 (clear offline device data on sign-out once nothing
  is pending) is partial — isolation is enforced, nothing is silently
  erased while work is pending, but automatic clearing once the queue is
  empty is not implemented.
- See `docs/adr/0008-phase-6-offline-sync.md` and `docs/offline-sync.md`
  for the full design record; `docs/REQUIREMENTS_TRACEABILITY.md`'s
  FR-OFF/FR-AUTH-09/NFR-SEC-09/NFR-REL-05/NFR-MNT-07 rows are updated.

### Added — Phase 5 closure: FR-RPT-05, FR-AUD-06, and skip removal

- Income by Party (`src/app/(app)/(partner)/party-income-report`,
  `getPartyIncomeReport`): FR-RPT-05/FR-PINC-08's "income by party across
  a chosen range" — daily/monthly/cash-receipt components and a combined
  total, per party across an arbitrary validated date range, Postgres-side
  `groupBy`/`SUM` throughout; zero-income parties shown, never omitted;
  Partner/Admin-only, Operator denied through the UI and a direct call.
- FR-AUD-06 now covers `asset`/`capital_contribution` audit rows too — a
  batched (never N+1) live lookup of `acquiredOn`/`entryDate` resolves
  their business date, since neither is ever written into the audit
  JSON snapshot. Previously `null` for both entity types; still `null`
  only when the date is genuinely unset.
- Removed the one conditional Playwright skip in
  `tests/e2e/phase5-reporting.spec.ts`: the "History button" test now
  creates its own Asset fixture through the real form, rather than
  depending on the shared dev database already containing one.
- See `docs/adr/0007-phase-5-calculations-dashboard-reports.md` §13/§14
  for the full record; `docs/REQUIREMENTS_TRACEABILITY.md`'s FR-RPT-05
  and FR-AUD-06 rows are now both `Implemented` with no disclosed gap.

### Added — Phase 5: Calculations, Dashboard, Warnings, Reports, and Audit Log

- `app_settings.partner_a_user_id`/`partner_b_user_id` — explicit Partner
  A/B identity for the profit split (never account-creation order), two
  `CHECK` constraints (both-configured-or-neither; distinct), two
  `reject_if_not_partner()` triggers, `ON DELETE RESTRICT` — one additive
  migration (`20260821181426_phase5_partner_mapping`), no earlier
  migration touched, no `prisma db push`. The Admin-only setup action
  (`profit-split:configure-partners`) is write-once.
- Monthly Summary (`src/app/(app)/(partner)/monthly-summary`): any
  user-chosen date range or one-action month-stepping; itemised
  Administration/Purchasing breakdown (partner-funded categories shown
  as their own tagged line, never hidden, per BR-07/FR-RES-06); the
  50/50-default profit split applied and shown per partner, or an
  explicit "configuration required" state (never a fabricated split)
  until both partners are mapped; PDF (A4, `pdfkit@0.19.1`) and Excel
  (5 sheets, `exceljs@4.4.0`) exports, both stamped with the range,
  Asia/Karachi generation time, and the producing user.
- Partner Dashboard (`src/app/(app)/(partner)/dashboard`): real
  current-vs-previous-month income/expense/result tiles; a plain,
  accessible SVG/CSS 6-month trend chart (no charting library added);
  a warnings panel — missing recurring bill, missing instalment line,
  and marked variance from the prior month (approved formula: `max(Rs
5,000, previous × 20%)` threshold).
- Audit Log (`src/app/(app)/(partner)/audit-log`): read-only, filterable
  by user/record type/date range, keyset (never `OFFSET`) pagination; a
  reusable "History" action wired into Daily/Monthly Expense, Asset,
  Monthly Party Bill, Counter Income, and Capital Contribution rows;
  defensive recursive redaction (case-insensitive substring match on 8
  keywords) applied inside the query layer itself, before a row's
  before/after values ever leave it.
- `src/lib/domain/decimal-export.ts`'s `toSafeExcelNumber` — the sole,
  six-step-verified boundary where a monetary `Decimal` becomes a JS
  `number`, only for ExcelJS's numeric-cell API; formula-injection
  protection (`sanitizeTextCell`) on every free-text export cell.
- The July 2026 reconciliation fixture (`tests/fixtures/july-2026-corrected.ts`)
  and its permanent regression test, reproducing the **corrected**,
  single-AT-WASTE figures (Income Rs 1,495,535; Expenses Rs 1,287,459;
  Profit Rs 208,076; Rs 104,038 per partner; Daily Expenses Rs 171,190;
  Daily-billing Party Income Rs 225,650) — see
  `docs/adr/0007-phase-5-calculations-dashboard-reports.md` for why the
  corrected figures were used instead of AC-02's literal, uncorrected
  prose.
- Full Operator authorization sweep across every new Phase 5
  query/route (`tests/integration/authorization/phase5-authorization-sweep.test.ts`),
  and performance tests proving NFR-PERF-04/05 hold with three years of
  synthetic data loaded (NFR-PERF-06).
- **Fixed:** `getItemizedExpenseBreakdown` previously summed only
  Business-funded rows per category, silently hiding a category with
  only partner-funded spending — a direct contradiction of
  BR-07/FR-RES-06. Now groups by `(categoryId, fundingSource)`, so a
  partner-funded line always appears, separately tagged.
- **Fixed:** the PDF export route threw `ENOENT` on `pdfkit`'s
  `Helvetica.afm` under Next.js's default server-side dependency
  bundling. `next.config.ts` now sets `serverExternalPackages: ["pdfkit"]`.
- **Deferred (approved):** FR-WARN-05 (per-month warning dismissal) —
  needs new persisted per-user/per-month state outside this phase's
  data-model scope.
- **Disclosed gap:** FR-RPT-05 ("income by party across a chosen range")
  was not built as its own report screen in this phase.

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
  monthly-billing party per month, DB-enforced; completes FR-PINC-07's
  three-way total (daily + monthly + cash receipts) via the new
  `getPartyMonthlyTotals` query. FR-PINC-08 remains Partial — totals are
  shown for a calendar month only; an arbitrary custom date range is not
  yet offered.
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
