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

## Not yet built

- Monthly expenses, assets, capital contributions, and the partner
  investment statement — Phase 4.
- Results/dashboard/reports/warnings screens — Phase 5.
- Offline entry queue and synchronization (Dexie, service workers,
  conflict resolution) — Phase 6. Phase 3B's screens are online-only.
- Full master-data admin UI and profit-split settings screen — Phase 7.
- On the Daily Expenses screen specifically: date-range/item/funding-
  source filter _controls_ (the underlying query already supports them)
  and edit/archive _UI_ (the mutations exist and are tested, but no
  screen calls them yet) — tracked as `Partial` rows in
  `docs/REQUIREMENTS_TRACEABILITY.md` (FR-DEXP-07/09), not silently
  dropped.

See `docs/PROJECT_PLAN.md` for the phase-by-phase implementation sequence
this document tracks, and `docs/adr/` for the detailed record of each
architectural decision.
