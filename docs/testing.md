# Test Plan and QA Checklist

Status: Phase 1, Phase 2, Phase 3A, and Phase 3B test infrastructure in
place. Filled in further as each later phase's coverage is built — see
`docs/PROJECT_PLAN.md` for what each phase tests, and
`docs/REQUIREMENTS_TRACEABILITY.md` for the full requirement-to-test
mapping.

## Test types

- **Unit** (`tests/unit/**`) — pure `src/lib/domain` functions against
  synthetic fixtures. No database, no server. Run by `npm run test`.
- **Integration** (`tests/integration/**`, excluding `constraints/`) —
  exercises the real Prisma Client against a real, disposable PostgreSQL
  database (the seed script's actual content, `client_uuid` behavior,
  etc.). Run by `npm run test` alongside unit tests.
- **Constraint/trigger** (`tests/integration/constraints/**`) — proves
  every `CHECK` constraint, trigger, and foreign-key delete rule added in
  the hand-edited migration SQL, via an actual failing insert/update/delete
  against real Postgres — never inferred from "no code path calls that."

## The test database — required from Phase 1 onward

Integration and constraint tests require a real PostgreSQL database and
refuse to run without one, per `tests/integration/helpers/test-db.ts`:

- Set `TEST_DATABASE_URL` (copy `.env.test.example` to `.env.test` and
  point it at a disposable database whose name ends in `_test`).
- The helper parses the URL and hard-fails if the database name does not
  end in `_test` — this is a deliberate guard against a misconfigured
  environment variable ever pointing truncation/cleanup at a development
  or production database.
- `TEST_DATABASE_URL` is never used as a fallback for `DATABASE_URL`, and
  vice versa — the two are always independent, and CLI commands intended
  for the test database always set `DATABASE_URL="$TEST_DATABASE_URL"`
  explicitly on that one command line (see the commands below), never via
  an edited `.env` file.
- Isolation between tests is by **truncation**, not transaction rollback:
  `resetDatabase()` runs one `TRUNCATE ... RESTART IDENTITY CASCADE`
  statement covering all 13 business tables, called from a `beforeEach`
  hook in every integration/constraint test file. This was chosen over
  Prisma's interactive `$transaction` rollback pattern, which is
  technically workable but requires strict, easy-to-miss discipline about
  routing every write through the transaction callback's parameter — see
  the Phase 1 plan for the full comparison.
- Integration/constraint tests run **serially** (`fileParallelism: false`
  in `vitest.config.mts`) since they share one real Postgres instance.

## Required local/CI commands (Phase 1 onward)

```bash
npx prisma generate                                          # after every schema change — Prisma 7 no longer does this automatically
npx prisma migrate dev --create-only --name <name>            # scaffold a new migration (dev database, via DATABASE_URL)
npx prisma migrate deploy                                     # apply to the dev-equivalent database
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy    # apply the same migration to the test database — explicit override, never implicit
npx prisma migrate status                                     # verify no drift
npx prisma db seed                                             # seed whichever database DATABASE_URL currently points at
npm run test                                                   # unit + integration + constraint tests together
```

## Why Prisma needs a driver adapter at all

Prisma 7's generated `PrismaClient` requires an explicit driver adapter
(`@prisma/adapter-pg`, wrapping `pg`) — there is no bare
`DATABASE_URL`-string connection path at runtime, confirmed by reading
`node_modules/@prisma/client/runtime/client.d.ts` directly. `prisma.config.ts`'s
`datasource.url` is read only by Prisma CLI commands (`migrate`, `db seed`,
`validate`), never by the Client itself — every runtime `PrismaClient` in
this project (the seed script, the test helpers) is built via
`prisma/client.ts`'s `createPrismaClient(connectionString)` factory, which
takes the connection string as an explicit argument rather than reading
any environment variable itself.

## Current coverage (Phase 1)

- **Unit** (`tests/unit/domain/`): funding-source rule, income/expense
  aggregation, net profit/loss, the deterministic profit-split remainder
  rule, and partner-investment aggregation (including `DRAWING` sign
  handling) — all against synthetic, non-July-2026 fixtures, all proving
  exact `Decimal` arithmetic.
- **Integration/constraint** (`tests/integration/`): funding-source
  bidirectional exclusivity, partner-eligibility triggers (funded-by/
  purchased-by/partner_user_id), asset acquisition-mode exclusivity,
  monetary positivity constraints, `client_uuid` uniqueness on all four
  offline-capable tables, counter-income non-blocking duplicate dates,
  instalment idempotency (reject-duplicate-active and
  archive-then-correct), the audit-log append-only trigger, physical-
  deletion rejection on every protected table, foreign-key delete-rule
  inspection (no `CASCADE`/`SET NULL` anywhere), and the seed script's
  exact contents (master data present, zero users, zero transactions).

## Current coverage (Phase 2)

- **Unit** (`tests/unit/permissions/`, `tests/unit/auth/`): the centralized
  `requirePermission` role/permission logic; the production-HTTPS startup
  guard; the fail-closed email-transport guard (production requires SMTP,
  the dev/test file sink refuses to run when `NODE_ENV=production`).
- **Integration** (`tests/integration/auth/`, `tests/integration/constraints/auth-schema.test.ts`):
  `sessions.token`/`account (issuer, accountId)` uniqueness; `users`' Phase 1
  delete-rejection trigger still holds after the Phase 2 migration;
  `sessions`/`account`/`verification` are proven deletable (deliberately
  not trigger-protected); the invitation-gate token is proven to store
  only a SHA-256 digest, never the raw token; single-use and reissue-
  invalidates-all-prior-tokens behavior; a transient failure _after_ gate
  validation (an invalid password rejected by Better Auth's own
  `resetPassword`) is proven to leave the gate token valid for a retry,
  not burned; 10-consecutive-failure lockout including under concurrent
  requests; a locked/inactive account's session is proven to never reach
  the caller and to be revoked immediately; `audit_log` rows for every
  auth event, checked for the complete absence of any password, hash,
  token, or URL; cookie `Secure` attribute proven environment-aware (absent
  over HTTP, present when `NODE_ENV=production` with an HTTPS origin);
  sign-out, password reset, and deactivation each proven to reject a
  cookie captured _before_ that action, replayed after it.
- **Playwright e2e** (`tests/e2e/auth.spec.ts`): the Sign In screen renders
  the approved Stitch design; unknown-email and wrong-password produce the
  identical generic error; valid sign-in reaches the role-appropriate
  placeholder; an Operator is denied direct navigation to an Admin-only
  route; the session cookie is `HttpOnly`/`SameSite=Lax`; a cross-origin
  POST to the auth API is rejected. Fixtures are created by
  `scripts/e2e-create-user.ts`, run via `tsx` as a child process from
  `tests/e2e/helpers/create-user.ts` — this exercises the real
  invitation-acceptance code path with **no test-only route of any kind**
  compiled into the Next.js app (the earlier `/api/test/seed-user` route
  was removed once this mechanism was in place — see
  `docs/adr/0003-phase-2-authentication.md`'s closure section).

## Current coverage (Phase 3A)

- **Unit** (`tests/unit/navigation/`, `tests/unit/ui/`): the incremental
  nav-item table's per-role filtering (`visibleNavItems`) and its
  contextual-title lookup (`titleForPath`); the initials-avatar helpers
  (deterministic initials and color from a name).
- **Playwright e2e** (`tests/e2e/shell.spec.ts`): an Operator's sidebar
  shows only Home, a Partner's shows Home and Dashboard (never Users), an
  Admin's shows all three — checked by DOM presence/absence, not merely
  CSS visibility; a Partner is denied direct navigation to the Admin-only
  `/users` route independent of what the nav shows; the mobile drawer
  opens via the header's hamburger button, traps Tab focus inside the
  open native `<dialog>`, closes on Escape, and returns focus to the
  trigger button; no horizontal page scroll at a 375px viewport; the user
  menu opens via the avatar, is keyboard-closable (Escape, with focus
  returned to the trigger), and completes a real sign-out; the
  skip-navigation link is the first focusable element on the page and
  targets `#main-content`; a full sign-in-and-navigate flow produces zero
  requests to `fonts.googleapis.com`/`fonts.gstatic.com` and zero browser
  console errors. All pre-existing Phase 2 tests (127 Vitest, 9 of the 18
  Playwright specs) were re-run and still pass after the `(app)` route
  move and the auth-screen primitive retrofit.

## Current coverage (Phase 3B)

- **Unit** (`tests/unit/domain/calendar-date.test.ts`,
  `tests/unit/validation/*.test.ts`): strict `YYYY-MM-DD`/`YYYY-MM`
  parsing and rejection (leap years, malformed shapes, no
  `z.coerce.date()`-style ambiguity); `todayInKarachi`/
  `currentYearMonthInKarachi` timezone-independence across a UTC evening/
  Karachi-next-day boundary and a summer/winter boundary (no DST in
  Pakistan); the shared decimal-amount validator (zero/negative/
  precision rejection, `NUMERIC(14,2)` digit limits); every entity's Zod
  schema (funding-source bidirectional requirement, item-XOR-description,
  cash-receipt note requirement, counter-income's `>= 0` exception).
- **Integration** (`tests/integration/audit/business-audit.test.ts`,
  `tests/integration/constraints/party-income-daily-cell-idempotency.test.ts`,
  `tests/integration/mutations/*.test.ts`,
  `tests/integration/queries/party-income-grid.test.ts`): transactional
  business-audit atomicity in both failure directions; the new partial
  unique index rejecting a second active `DAILY` cell while never
  restricting `CASH_DIRECT`/`MONTHLY` rows, and permitting
  archive-then-correct; every mutation's create-idempotency **including a
  genuine `Promise.all` concurrency test** (both callers succeed, exactly
  one row and one audit row exist), the distinct-conflict case (a
  different `client_uuid` racing for the same party/day cell is a real
  error, never treated as a replay), atomic stale-write rejection,
  archived-row edit rejection, and Counter Income's two-step
  duplicate-confirmation flow (warn → confirm → create, and a retried
  `client_uuid` never re-shown the warning); the Party Income grid
  query's archived-party historical-visibility rule in both directions.
- **Playwright e2e** (`tests/e2e/entries.spec.ts`): a Business-funded and
  a Partner-funded Daily Expense end to end; a Party Income grid cell
  surviving a reload and Enter moving focus to the next day down; a Cash
  Receipt not populating a grid cell; Counter Income's duplicate warning
  and confirmation, and a zero-amount entry; Operator Home showing no
  "Pending Uploads"/sync-status chrome; direct-route authorization
  (unauthenticated requests to all three new screens redirect to Sign
  In). `tests/e2e/shell.spec.ts`/`auth.spec.ts` were updated (nav-item
  counts, the real Home heading) to match, not weakened — every existing
  assertion still holds, only the counts/text that intentionally changed
  were corrected. Because the dev database is shared and persistent
  across parallel e2e runs (unlike the `_test` database `tests/
integration/**` truncates between tests), every new assertion is
  scoped to that test's own uniquely-marked row rather than a cumulative
  total or row count.

### Phase 3B closure — filters, edit/archive, money formatting

- **Unit** (`tests/unit/domain/money-format.test.ts`): the shared
  `formatMoney` helper — zero, whole numbers, two-decimal values, large
  values (thousands separators), and negative-value display, all via
  pure string manipulation (no `Number()`/`parseFloat`/`.toNumber()`).
- **Integration** (`tests/integration/mutations/party-income.test.ts`):
  `createCashReceipt`'s own retried-`client_uuid` replay (no second row,
  no second audit row) and a genuine `Promise.all` concurrency case —
  closing the one idempotency/audit combination the original Phase 3B
  pass had only proven for the grid-cell and Daily Expense create paths.
- **Playwright e2e** (`tests/e2e/entries.spec.ts`): Daily Expense filter
  controls (date range, item-or-description search, funding source), all
  reflected in the URL and surviving a Reset Filters round trip, plus an
  empty state when nothing matches; the full Daily Expense edit/archive
  lifecycle (edit opens prefilled, saves, archive confirmation names the
  exact record, the row disappears from the active list); a stale Daily
  Expense edit (a second, out-of-band change simulated via
  `scripts/e2e-touch-daily-expense.ts`, the same child-process pattern as
  `scripts/e2e-create-user.ts`) showing a clear reload message and never
  applying; Cash Receipt reachability from both Operator Home and the
  Party Income page, its own visible confirmation, and its `CASH_DIRECT`
  persistence + one audit row (checked via
  `scripts/e2e-verify-party-income-row.ts`, the same DB-check-via-child-
  process pattern — no test-only HTTP route was added).
- A real bug was found and fixed during this pass: `formatMoney`'s first
  version pulled the generated Prisma client (a Node-only module) into
  the browser bundle transitively through `Decimal`, crashing Turbopack's
  compile of `/party-income` outright once two Client Components started
  calling it. Fixed by making the `Decimal` import type-only and
  formatting via pure string operations — see
  `docs/adr/0005-phase-3b-operator-workflows.md` §13 for the full account
  and the precedent it sets for any future shared Server/Client module.
- Full suite at Phase 3B's close (including this closure pass): **236
  Vitest tests across 39 files**, **34 Playwright e2e tests**,
  `prisma validate`/`prisma format` (zero schema diff), `prisma migrate
status` (no drift), and a production build — all passing. No
  pre-existing Phase 1/2/3A/3B test was weakened, removed, or skipped;
  the two shell/auth
  assertions that referenced now-superseded specifics (the old
  placeholder's "Operator Home" heading, the pre-Phase-3B nav-item
  counts) were corrected to match the new, real functionality they now
  describe.

The July 2026 reconciliation fixture (`CLAUDE.md` §21, `AC-02`) — the
single most important regression test in the project — is built in
**Phase 5**, and only once the AT WASTE conflict (`CLAUDE.md` §27) is
resolved with the client. Phase 1's seed data deliberately contains no
July 2026 transaction amounts at all, so this conflict does not arise in
any test built so far.

### Phase 4 — Monthly Expenses, Assets, and Partner Investment

- **Migration/constraint tests**: the extended `assets_acquisition_mode_check`
  (rejects `INSTALMENT` with no `default_category_id`, rejects `CASH` with
  one set — `tests/integration/constraints/asset-acquisition-mode.test.ts`);
  the new `party_income_active_monthly_party_month_unique` partial unique
  index, including archive-then-correct and the DAILY/CASH_DIRECT
  non-interference proof
  (`tests/integration/constraints/party-income-monthly-unique.test.ts`).
  Every pre-existing Phase 1 test that created an `INSTALMENT` asset was
  updated to supply a `default_category_id`, since the Phase 4 migration
  makes it a required column for that mode.
- **Instalment-generation concurrency** (`tests/integration/mutations/monthly-expenses.test.ts`):
  a genuine `Promise.all` race generating the same asset/month twice
  proves exactly one row and one audit event survive; a sequential
  second run against an already-generated month is a query-time no-op
  (the candidate list itself excludes it); an archived asset is excluded
  from all future generation; editing an asset's `monthlyInstalment`
  is proven to leave an already-generated month's row unchanged while a
  later month picks up the new amount.
- **Recurring pre-fill** (`FR-MEXP-06`): a recurring category's most
  recent prior-month row is proven to drive the preview, and confirming
  creates exactly the previewed line.
- **Same-category duplicate warning** (`FR-MEXP-08`): the same two-step
  `confirmedDuplicate` non-blocking flow as Counter Income, proven at
  both the integration and Playwright layers.
- **Monthly Party Income** (`FR-PINC-03`): create, the one-figure-per-
  party-per-month rejection, replay-safety via `client_uuid`, and
  correcting an already-recorded month as an ordinary edit (never a
  second row) — `tests/integration/mutations/party-income.test.ts`.
  `getPartyMonthlyTotals`'s three-way combination (daily + monthly +
  cash receipts, per billing mode, zero-not-omitted) is proven in
  `tests/integration/queries/party-monthly-totals.test.ts`, completing
  FR-PINC-07. FR-PINC-08 stays Partial — the same test proves totals for
  a calendar month only; no custom date range exists yet.
- **Assets and Capital Contributions**: full create/edit/archive
  lifecycles with atomic conditional-write stale-write protection
  (`tests/integration/mutations/assets.test.ts`,
  `tests/integration/mutations/capital-contributions.test.ts`); an
  instalment asset's default category is proven rejected when inactive
  or when it belongs to Administration rather than Purchasing; a
  `DRAWING` is proven to always store a positive `Decimal`, with the
  sign applied only by `partnerInvestmentTotal`
  (`tests/integration/queries/capital-contributions.test.ts`), never a
  negative number written anywhere.
- **Playwright e2e** (`tests/e2e/monthly-workflows.spec.ts`): Operator
  denial by direct navigation to all four new Partner routes; an
  Instalment asset created and its line generated via the preview-then-
  confirm UI; a Cash asset created with a purchasing partner, appearing
  in the Investment statement and never in Monthly Expenses; the Cash-
  mode partner field proven to be a required `<select>`, never an
  optional checkbox; a Monthly Expense and a Monthly Party Bill each
  created through the real UI; a Capital Contribution and a Drawing
  both recorded and shown moving the running total in opposite
  directions. `tests/e2e/shell.spec.ts`'s nav-item-count assertions were
  updated for the four new Partner sidebar entries.
- Full suite at Phase 4's close: **298 Vitest tests across 48 files**,
  **44 Playwright e2e tests**, `prisma validate`/`prisma format` (zero
  schema diff), `prisma migrate status` (no drift, both migrations
  applied to dev and test databases) — all passing. No pre-existing
  test was weakened, removed, or skipped; the nav-item-count assertions
  updated for the new routes are the only Phase 3 test edits.

### Phase 5 — Calculations, Dashboard, Warnings, Reports, Audit Log

Full design record: `docs/adr/0007-phase-5-calculations-dashboard-reports.md`.

- **Unit** (`tests/unit/domain/decimal-export.test.ts`,
  `tests/unit/audit-redaction.test.ts`, `tests/unit/server/export-safety.test.ts`,
  `tests/unit/validation/app-settings.test.ts`, extended
  `tests/unit/domain/calendar-date.test.ts`): `toSafeExcelNumber`'s full
  six-step verification (fractional-digit limit, safe-integer bound,
  round-trip reconstruction, `UnsafeDecimalExportError` on any mismatch);
  `redactSensitiveValues` against nested objects/arrays, case variations,
  and substring (not just exact-key) matches on all 8 mandated keywords;
  `sanitizeTextCell`'s formula-injection prefixing and `safeReportFilename`'s
  path-traversal-safe naming; the partner-mapping Zod schema (distinct
  UUIDs, rejection of a shared id, malformed UUID, missing field);
  `nextYearMonth`/`parseCustomDateRange`'s boundary and rejection cases.
- **Integration** (`tests/integration/queries/{results,warnings,audit-log}.test.ts`,
  `tests/integration/mutations/app-settings.test.ts`,
  `tests/integration/reports/monthly-summary-exports.test.ts`,
  `tests/integration/authorization/phase5-authorization-sweep.test.ts`,
  `tests/integration/fixtures/july-2026-reconciliation.test.ts`,
  `tests/integration/performance/phase5-performance.test.ts`): every
  headline total, the itemised category breakdown (including the
  partner-funded-line visibility fix, BR-07/FR-RES-06), the Partner A/B
  mapping's write-once behavior and its `CHECK`/trigger enforcement at
  the database level (direct-write tests, not just the mutation path),
  the approved variance-warning formula, keyset pagination correctness
  (no duplicate/skipped rows across pages), redaction applied before a
  row ever leaves the query layer, both exports' real file signatures
  and content (a crafted formula-injection description round-tripping
  safely, monetary cells as real numbers never formatted strings, no
  Audit Log sheet ever generated), a full Operator-denial sweep across
  every new Phase 5 query, and the July 2026 reconciliation fixture
  reproducing the corrected figures exactly through the real query layer
  (Income Rs 1,495,535 / Expenses Rs 1,287,459 / Profit Rs 208,076 /
  Rs 104,038 per partner / Daily Expenses Rs 171,190 / Daily-billing
  Party Income Rs 225,650). Performance: a synthetic 3-year (~10,000-row)
  dataset seeded once via `createMany` bulk inserts; a single month's
  result computed in ~28ms (NFR-PERF-04 limit: 3,000ms) and a full
  3-year-range export produced in ~582ms Excel / ~29ms PDF
  (NFR-PERF-05 limit: 15,000ms).
- **Playwright e2e** (`tests/e2e/phase5-reporting.spec.ts`): Operator
  denial for `/monthly-summary`, `/dashboard`, `/audit-log`; the
  Dashboard's real tiles, SVG trend chart, and warnings section; Monthly
  Summary's tiles, month-stepping, custom-range form, and both export
  links, including a real authenticated PDF download; the Partner A/B
  mapping setup flow (tolerant of the mapping already being configured
  by an earlier run on the shared dev database — selects by option
  **value**, i.e. the user's id, never by visible label, since many
  e2e-created accounts share the exact same `fullName`); the Audit Log's
  filter form and a record's own History action.
  `tests/e2e/shell.spec.ts`'s nav-item-count assertions were updated for
  the two new Partner sidebar entries (Monthly Summary, Audit Log).
- **Two real bugs found and fixed during this pass, not just documented:**
  (1) an SVG `<title>` rendered with multiple interpolated children
  produced a genuine React SSR/CSR hydration-mismatch warning — fixed by
  passing one template-string child; (2) the PDF export route threw
  `ENOENT` on `pdfkit`'s `Helvetica.afm` under Next.js's default
  server-side dependency bundling (which rewrites the package-relative
  path pdfkit reads its font-metrics files from) — fixed via
  `next.config.ts`'s `serverExternalPackages: ["pdfkit"]`. Both were
  caught only because the Playwright suite actually drives a real
  browser against the real dev server, not a mocked/unit-only check.
- Full suite at Phase 5's close: **367 Vitest tests across 60 files**,
  **53 Playwright e2e tests** (1 conditionally skipped — no existing
  asset row on the shared dev database to check history against),
  `prisma validate`/`prisma format` (zero schema diff), `prisma migrate
status` (no drift, the new migration applied to both dev and test
  databases) — all passing. No pre-existing test was weakened, removed,
  or skipped; the nav-item-count assertions updated for the two new
  routes are the only earlier-phase test edits.
