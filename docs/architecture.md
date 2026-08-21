# Architecture Overview

Status: Phase 1 (database & domain foundation), Phase 2 (authentication &
authorization), Phase 3A (shared application shell & reusable UI
foundation), and Phase 3B (Operator transaction workflows) in place.
Updated further as later phases add Partner/Admin business screens,
reporting, and offline UI on top of the shell.

## Data layer (Phase 1)

- `prisma/schema.prisma` — the 13 SRS business tables (`docs/SRS.md` §6),
  10 enums, and every relation. Every money column is `Decimal @db.Decimal(14,2)`;
  every timestamp is `DateTime @db.Timestamptz(6)`, stored in UTC (DR-02) —
  Pakistan-time display conversion is a Phase 3+ presentation concern, not
  a storage one.
- Constraints and triggers that Prisma's schema language cannot express —
  `CHECK`s, partner-eligibility triggers, the audit-log append-only
  trigger, physical-deletion-rejection triggers, and the instalment
  partial-unique index — are hand-added to the generated migration SQL
  (`prisma/migrations/20260820170711_init/migration.sql`), per the
  documented Prisma escape-hatch pattern (`CLAUDE.md` §20). This is the
  only migration so far; every future schema change adds a new one.
- `docs/adr/0002-phase-1-schema-clarifications.md` records every place
  this schema deliberately deviates from SRS §6's literal text (the
  12-vs-13 table count, `users.password_hash` omitted, `app_settings.updated_by`
  nullable, the counter-income unique-constraint conflict, `assets`'
  `status`-only archive representation) and why.
- Prisma 7 requires an explicit driver adapter to connect at all — there
  is no bare-connection-string runtime path. `prisma/client.ts` exports
  one factory, `createPrismaClient(connectionString)`, used by both the
  seed script and every test helper, so the adapter-construction code
  exists in exactly one place.

## Domain layer (Phase 1)

`src/lib/domain/` — pure, framework-agnostic functions with no
`PrismaClient`, Next.js, or I/O dependency (only `money.ts` references the
generated client, and only for the `Decimal` value type):

- `funding-source.ts` — the funding-source rule (BR-02/05/06/07, DR-07).
- `result.ts` — income/expense aggregation and net profit/loss.
- `profit-split.ts` — the two-partner split with a deterministic
  rounding-remainder rule (BR-10/11).
- `investment.ts` — partner investment aggregation, including `DRAWING`
  sign handling (FR-INV-01/02, BR-06/08/11).

This isolation is what makes these functions unit-testable
(`tests/unit/domain/`) with no server or database, and what will make the
July 2026 reconciliation fixture (Phase 5) and the funding-source rule
testable in complete isolation, per `CLAUDE.md` §25.

## Authentication and authorization layer (Phase 2)

Full design record: `docs/adr/0003-phase-2-authentication.md`.

- `src/lib/auth/config.ts` — `buildAuth(prisma, baseURL)`, a factory (not a
  bare singleton) so integration tests can bind a Better Auth instance to
  the test database; `src/server/auth.ts` is the one real singleton the
  application uses, adding the production HTTPS/SMTP startup assertions.
- `src/lib/auth/invitation.ts` — the two-layer invitation-acceptance
  mechanism: a project-owned, SHA-256-hashed "gate" token (plain Prisma
  rows in the shared `verification` table, never Better Auth's internal
  adapter) wraps Better Auth's own public `requestPasswordReset`/
  `resetPassword` endpoints for the actual credential creation — no
  internal Better Auth API is ever called directly. The gate token is
  consumed only after credential creation fully succeeds (one
  `prisma.$transaction` with a `pg_advisory_xact_lock`), so a transient
  failure never burns a legitimate invitation.
- `src/lib/auth/lockout.ts` — FR-AUTH-07's 10-failure/15-minute lockout via
  one atomic `UPDATE ... RETURNING`, and the corrected sign-in sequencing
  that guarantees a locked or deactivated account's session is deleted
  before any `Set-Cookie` header is ever forwarded to the browser.
- `src/lib/permissions/` — `roles.ts` (OPERATOR ⊂ PARTNER ⊂ ADMIN), `matrix.ts`
  (the one centralized permission table every future functional area
  plugs into), `guard.ts` (`requirePermission`, called identically from
  every Server Component/Action/Route Handler).
- `src/lib/email/` — fail-closed SMTP (production)/git-ignored file sink
  (development/test) delivery; production refuses to start with an
  incomplete SMTP configuration.
- `src/server/auth.ts`, `src/server/session.ts`, `src/server/actions/auth.ts`,
  `src/server/cookies.ts` — the application's one Better Auth instance,
  the session/`is_active` re-check on every request, sign-in/out/invite/
  accept-invitation/reset/deactivate server actions, and the narrow
  `Set-Cookie` forwarder.
- `scripts/bootstrap-admin.ts` — the one-time, TTY-gated first-Admin
  bootstrap command.

## Shared shell and UI foundation layer (Phase 3A)

Full design record: `docs/adr/0004-phase-3a-shared-shell.md`.

- `src/app/(app)/layout.tsx` wraps the `(operator)`/`(partner)`/`(admin)`
  route groups (moved one directory level deeper; public URLs unchanged —
  route groups are never part of the URL) in `AuthenticatedShell`.
- `src/components/layout/{AuthenticatedShell,ShellChrome,Sidebar,Header,UserMenu}.tsx`
  — the sidebar/header chrome every authenticated screen shares. The
  mobile navigation drawer and the user menu are both native `<dialog>`
  elements opened via `showModal()`, so focus-trapping, Escape-to-close,
  and focus-return to the trigger element are all browser-native behavior,
  not hand-rolled JavaScript.
- `src/lib/navigation/nav-items.ts` — an **incremental** navigation table
  (only routes that exist today), filtered per role by the same
  `hasAtLeastRole` rank comparison `src/lib/permissions/guard.ts` already
  uses. This is presentational filtering only; it never grants access —
  every page still calls `requirePermission` itself.
- `src/components/ui/*` — the reusable primitive set (`Button`,
  `TextInput`, `Select`, `Checkbox`, `Card`, `Table`, `Badge`, `Alert`,
  `Modal`, `EmptyState`, `LoadingSkeleton`, `Avatar`). `Modal` and the
  mobile drawer both use the native `<dialog>` element rather than a
  hand-rolled focus trap.
- `src/lib/fonts.ts` — Inter and Material Symbols Outlined, self-hosted via
  `next/font/local` from vendored, OFL-1.1-licensed `.woff2` files under
  `public/design-assets/fonts/` (never `next/font/google` — no build-time
  or runtime request to Google Fonts). Provenance, versions, and checksums
  are recorded in `public/design-assets/fonts/PROVENANCE.md`.
- `src/app/globals.css` — the complete design-token set (`@theme` block):
  full color palette, 8-step typography scale (each a `--text-*` token
  with `--line-height`/`--letter-spacing`/`--font-weight` companions),
  spacing, and radius (the `full`/pill radius is reserved for
  avatars/badges only, per the already-approved radius decision — cards,
  buttons, and dialogs keep the HTML's own `DEFAULT`/`lg`/`xl` values).
- The four Phase 2 `(auth)` screens (Sign In, Forgot Password, Reset
  Password, Accept Invitation) were retrofitted onto the new
  `Button`/`TextInput`/`Card`/`Alert`/`Checkbox` primitives — a
  behavior-preserving refactor, re-verified against the full Phase 2
  security test suite (all 127 Vitest + 18 Playwright tests passing).

## Operator transaction workflows layer (Phase 3B)

Full design record: `docs/adr/0005-phase-3b-operator-workflows.md`.

- **Query/mutation split, not one server-actions file per entity.**
  `src/server/queries/*.ts` (read) and `src/server/mutations/*.ts` (write,
  framework-independent — take `prisma`/`currentUser` as plain arguments,
  directly unit/integration-testable) hold the real logic; thin
  `"use server"` wrappers in `src/server/actions/*.ts` resolve
  `currentUser` from real request headers and pass the runtime `prisma`
  singleton — `currentUser` is never a client-suppliable parameter.
- **Create-idempotency**: a browser-generated `client_uuid`
  (`src/lib/client-uuid.ts`) is checked via `findUnique` first, then the
  database's own unique-constraint violation (`src/lib/prisma-errors.ts`)
  is the final authority under real concurrency — never the `findUnique`-
  then-`create` sequence alone. This is the exact protocol Phase 6's
  offline queue will reuse.
- **Stale-write protection**: every edit/archive is a single conditional
  `updateMany` (`where: { id, updatedAt: expectedUpdatedAt, isArchived:
false }`), never a read-then-write.
- **Transactional business audit**: `src/lib/audit.ts`'s
  `appendBusinessAudit` accepts only `Prisma.TransactionClient` — every
  mutation's audit row commits or rolls back atomically with the business
  row it describes, diverging deliberately from Phase 2's
  `appendAuthAudit` (plain `PrismaClient`).
- **Calendar dates**: `src/lib/domain/calendar-date.ts` — strict
  `YYYY-MM-DD`/`YYYY-MM` parsing (`Date.UTC` round-trip validated, never
  `z.coerce.date()`) and Asia/Karachi "today"/month-boundary helpers via
  `Intl.DateTimeFormat(...).formatToParts()` (never `.format()`).
- **Screens**: `src/app/(app)/(operator)/{daily-expenses,party-income,
counter-income}/page.tsx` plus `src/components/entries/*` (the
  `FundingSourceToggle`, the Party Income grid's per-cell autosave state
  machine in `GridCellInput`, the Cash Receipt modal, the Counter Income
  form with its two-step duplicate-confirmation flow). Operator Home
  (`(operator)/home/page.tsx`) now shows real quick actions and a real
  Recent Entries table, replacing the Phase 2 placeholder.
- A new additive migration
  (`prisma/migrations/20260821070503_phase3b_party_income_daily_cell_unique/`)
  adds `party_income_active_daily_cell_unique`, scoped to
  `receipt_type = 'DAILY'` only, mirroring Phase 1's instalment
  partial-unique-index pattern.

## Monthly-cadence Partner workflows layer (Phase 4)

Full design record: `docs/adr/0006-phase-4-monthly-assets-investment.md`.

- Same query/mutation/action split, `client_uuid`/stale-write/transactional-audit
  discipline as Phase 3B — no new protocol invented, only new entities
  (`monthly_expenses`, `assets`, `capital_contributions`) wired through it.
- **Asset acquisition-mode rule** (DR-08): a database `CHECK` constraint,
  not application logic alone, enforces `INSTALMENT` XOR `CASH` — each
  mode requires its own fields and forbids the other's.
- **Instalment generation**: Partner-triggered, previewed, and explicitly
  confirmed — never a silent background job (so FR-WARN-02's "missing
  instalment line" warning, built in Phase 5, stays meaningful). One
  `monthly_expenses` create per asset, each in its own transaction with
  its own audit row; a concurrent double-generation is caught as a P2002
  unique-constraint violation and treated as "already generated," the
  same idiom Phase 3B established for `client_uuid` replay safety.
- **Investment total**: `src/lib/domain/investment.ts`'s
  `partnerInvestmentTotal` takes no split/result input at all — it is
  structurally incapable of affecting the profit split (FR-INV-06).

## Calculations, dashboard, and reporting layer (Phase 5)

Full design record: `docs/adr/0007-phase-5-calculations-dashboard-reports.md`.

- **Postgres-side aggregation, always.** Every headline total
  (`src/server/queries/results.ts`'s `computeMonthlyResultTotals`) is a
  Prisma `aggregate`/`groupBy` (`SUM`), never a Node-side `reduce` over
  fetched rows — required for NFR-PERF-04/06 at realistic (multi-year)
  data volumes; proven directly against a synthetic 3-year, ~10,000-row
  dataset (`tests/integration/performance/phase5-performance.test.ts`).
- **Shared unchecked compute, independently gated wrappers.**
  `computeMonthlyResultTotals` itself performs no permission check — it is
  wrapped by two separately-gated callers, `getMonthlyResultTotals`
  (`report:financial-summary`, Monthly Summary) and the Dashboard's own
  call (`report:dashboard`), so two different screens/roles share one
  calculation path without sharing one authorization decision.
- **Explicit Partner A/B identity**, never account-creation order:
  `app_settings.partner_a_user_id`/`partner_b_user_id`, two `CHECK`
  constraints (both-configured-or-neither; distinct), two
  `reject_if_not_partner()` triggers, `ON DELETE RESTRICT`. The
  mapping-setup action is write-once — refuses a second call once both
  are set; re-mapping is Phase 7 settings-screen scope.
- **Decimal→number conversion happens at exactly one boundary**:
  `src/lib/domain/decimal-export.ts`'s `toSafeExcelNumber`, a six-step
  verified process (fractional-digit check, safe-integer check, convert,
  round-trip-reconstruct-and-compare, throw on any mismatch, no further
  arithmetic on the result) — the only place a monetary `Decimal` ever
  becomes a JS `number`, and only because ExcelJS's own numeric-cell API
  requires one.
- **Defensive audit redaction at the query layer, not render time**:
  `src/lib/audit-redaction.ts`'s `redactSensitiveValues` runs inside
  `listAuditLog`/`getEntityHistory` themselves, before a row's
  `oldValues`/`newValues` ever leave the query function — no caller can
  forget to redact. Case-insensitive substring match against 8 keywords,
  recursing through nested objects/arrays.
- **Keyset, never offset, pagination**: `audit_log.id` (`BigInt`
  autoincrement) drives `WHERE id < cursor ORDER BY id DESC` — exact and
  index-backed at any table size.
- **In-memory export buffers only**: both `pdfkit` (stream→`Buffer.concat`)
  and `exceljs` (`workbook.xlsx.writeBuffer()`) generators return a
  `Buffer` directly to the Route Handler — no temp file, ever.
  `next.config.ts` opts `pdfkit` out of Next.js's default server-bundling
  (`serverExternalPackages`) since it reads its `.afm` font files relative
  to its own package directory at runtime — bundling rewrites that path
  and breaks the lookup.
- **No charting library** (CLAUDE.md §24): the Dashboard's trend chart
  (`src/components/dashboard/TrendChart.tsx`) is a hand-built, accessible
  SVG bar chart — an SVG `<title>`/`<desc>` pair plus a visually-hidden
  data table as the non-SVG-dependent accessible alternative.
- **Correctness note**: `getItemizedExpenseBreakdown` groups by
  `(categoryId, fundingSource)`, never filtering out `PARTNER`-funded
  rows — a category with only partner-funded spending must still appear,
  separately tagged, per BR-07/FR-RES-06 (found and fixed during
  implementation, ADR-0007 §12).

## Not yet built

- Offline entry queue and synchronization (Dexie, service workers,
  conflict resolution) — Phase 6. Every screen through Phase 5 is
  online-only.
- Full master-data admin UI, profit-split percentage-editing screen, and
  Partner A/B re-mapping — Phase 7 (Phase 5 ships only the narrow,
  write-once initial mapping action).
- Historical Excel import — Phase 7.
- FR-WARN-05 (per-month warning dismissal) — deferred; needs new
  persisted per-user/per-month dismissal state outside Phase 5's approved
  data-model scope (ADR-0007 §5).
- FR-RPT-05 ("income by party across a chosen range" as its own report
  screen) — not built in Phase 5; disclosed gap, see
  `docs/REQUIREMENTS_TRACEABILITY.md`.
- On the Daily Expenses screen specifically: date-range/item/funding-
  source filter _controls_ (the underlying query already supports them)
  and edit/archive _UI_ (the mutations exist and are tested, but no
  screen calls them yet) — tracked as `Partial` rows in
  `docs/REQUIREMENTS_TRACEABILITY.md` (FR-DEXP-07/09), not silently
  dropped.

See `docs/PROJECT_PLAN.md` for the phase-by-phase implementation sequence
this document tracks, and `docs/adr/` for the detailed record of each
architectural decision.
