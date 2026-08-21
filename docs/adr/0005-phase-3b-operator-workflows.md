# ADR-0005: Phase 3B — Operator Transaction Workflows

## Status

Accepted.

## Context

Phase 3B builds the Operator's day-to-day entry screens — Daily Expenses,
the Party Income daily grid, direct Cash Receipts, and Counter Income —
entirely online (no Dexie/service worker/offline queue; that is Phase 6).
Several mechanisms here are architecturally significant enough to record
per `CLAUDE.md` §23/NFR-MNT-03: how a browser-generated identifier makes
online creates retry-safe without an offline queue to fall back on, how
Karachi-local dates are computed without trusting locale-format shape, how
business-entity audit writes are kept atomic with their mutation, and how
the Party Income grid's per-cell autosave stays correct under real
concurrency.

## Decisions

### 1. Client-generated `client_uuid` for online create-idempotency — not server-generated

`client_uuid` (DR-05) exists in the schema for Phase 6's offline queue, so
an earlier draft of this plan had the server generate it at insert time
(`crypto.randomUUID()`), since no offline device exists yet to generate
one. That was rejected: it gives up retry-safety for the exact case where
it matters most — a request whose response was lost to a flaky connection,
retried by the browser with a _new_ server-generated id each time, would
create a duplicate row. **Decision:** the browser generates `client_uuid`
via `crypto.randomUUID()` the moment a new entry begins (`src/lib/client-
uuid.ts`), before the first submit attempt, and reuses the same value
across every retry of that same entry. This is the exact protocol Phase 6
will reuse once the offline queue exists — not a different mechanism to
reconcile later.

### 2. Concurrent-safe create — the database's own unique constraint is the final authority, not `findUnique` alone

A naive idempotent-create sequence — `findUnique` by `client_uuid`, then
`create` if nothing was found — has a real race under genuine concurrency:
two requests carrying the same `client_uuid` (e.g. a retry fired while the
first attempt's response was still in flight) can both pass the
`findUnique` check before either `create` commits, and the second
`create` then fails with a unique-constraint violation that naive code
would surface as a generic error, not a successful replay. **Decision:**
keep the `findUnique` short-circuit for the common case (a genuine retry
after the first response was already known), but treat the database's own
P2002 unique-constraint violation on `client_uuid` as the final authority:
catch it, re-fetch the row by `client_uuid`, and return
`{ replayed: true }` — never a second audit row. `src/lib/prisma-
errors.ts`'s `isUniqueConstraintViolationOn` distinguishes _which_
constraint fired (via the Prisma 7 driver-adapter error's own
`constraint.fields`, verified directly against a live Postgres error, not
assumed) — a violation of an unrelated constraint (e.g. `party_income_
active_daily_cell_unique`, decision 4 below) is never caught as if it were
this same case; it is a genuine business-rule conflict, surfaced as a
normal error. Proven under real concurrency in `tests/integration/
mutations/*.test.ts` (`Promise.all` of two identical creates), not just
asserted from reading the code.

### 3. Framework-independent mutation core, thin `"use server"` wrappers

Every mutation's real logic (`src/server/mutations/*.ts`) takes `prisma`
and `currentUser` as plain parameters rather than importing the runtime
`PrismaClient` singleton or reading `next/headers` itself — the same
pattern `src/lib/auth/lockout.ts` already established
(`signInWithLockout(auth, prisma, ...)`), so the logic is directly
callable from Vitest against the real test database (Playwright/Next.js
request context is unavailable there). The `"use server"` action
(`src/server/actions/*.ts`) is the only place that resolves `currentUser`
from real request headers and passes the real `prisma` singleton —
`currentUser` is never accepted as a parameter a client could supply
itself, since that would let a caller assert its own role.

### 4. `party_income_active_daily_cell_unique` — an additive migration, preflight-checked, scoped to `receipt_type = 'DAILY'`

The Party Income grid needs "one active cell per party per day" as a real
database invariant, mirroring the existing `monthly_expenses_active_
instalment_per_asset_month` partial-unique-index pattern from Phase 1.
Not expressible in `prisma/schema.prisma` (Prisma 7 has no partial-index
DSL), so it is hand-added to a new, empty-from-`prisma migrate dev
--create-only` migration
(`prisma/migrations/20260821070503_phase3b_party_income_daily_cell_unique/`)
— never edited into the Phase 1 migration, never applied via `prisma db
push`. Before writing it, a preflight duplicate-detection query was run
against both the dev and test databases (recorded in the migration file's
own header comment); it returned zero rows (party_income is empty pre-
Phase-3B), so the migration proceeds without any data remediation. The
index is deliberately scoped to `receipt_type = 'DAILY'` only — a party
may still have any number of `CASH_DIRECT` (direct cash receipt) or
`MONTHLY` (Phase 4) rows sharing a `party_id`/`income_date`, proven in
`tests/integration/constraints/party-income-daily-cell-idempotency.test.ts`.

### 5. Karachi date handling — `formatToParts`, never `.format()` or `z.coerce.date()`

`src/lib/domain/calendar-date.ts` computes "today" and month boundaries in
Asia/Karachi via `Intl.DateTimeFormat(...).formatToParts()`, reading the
`year`/`month`/`day` parts individually and assembling the `YYYY-MM-DD`
string itself — not `.format()`, whose output _shape_ (separators, field
order) is not part of the stable `Intl` contract across every ICU build,
only each part's `type`/`value` pair is. Calendar dates typed by a user are
parsed by `parseCalendarDate`'s own strict regex + `Date.UTC` round-trip
check (rejects `2026-02-30`, `2026-13-01`, and any non-`YYYY-MM-DD` shape)
— `z.coerce.date()` is never used anywhere in this codebase, since it
accepts ambiguous, engine-dependent formats that this module exists to
rule out. A `@db.Date` column has no time-zone component once stored;
Asia/Karachi matters only for computing which calendar date "today" or
"this month" currently is, never for interpreting an already-typed date.

### 6. Decimal safety — amounts are validated strings until the one point they become `Prisma.Decimal`

`src/lib/validation/money.ts`'s `decimalAmountSchema` validates an amount
by regex alone (`^\d{1,12}(\.\d{1,2})?$`, matching `NUMERIC(14,2)`) and a
second regex to detect an all-zero value (`^0+(\.0+)?$`) — never `Number()`,
`parseFloat`, or `z.coerce.number()`. Each server mutation converts the
validated string to `Prisma.Decimal` exactly once, at the point the Prisma
`data` object is built; every aggregation (listing totals, grid row/party/
grand totals) reuses `src/lib/domain/money.ts`'s `Decimal`/`ZERO`, never a
JS `number`, end to end.

### 7. Transaction-scoped business audit — `appendBusinessAudit` accepts only `Prisma.TransactionClient`

`src/lib/audit.ts`'s `appendBusinessAudit` deliberately diverges from
Phase 2's `appendAuthAudit` (which takes a plain `PrismaClient`): it
accepts **only** `Prisma.TransactionClient`, so it can never be called
outside an interactive `prisma.$transaction` block. Every Daily Expense /
Party Income / Counter Income create, update, or archive writes its audit
row in the same transaction as the business mutation — proven in
`tests/integration/audit/business-audit.test.ts` by causing a failure
_after_ the audit write (the business row never commits either) and a
failure _after_ the business write (the audit row never commits either).

### 8. Atomic conditional writes for stale-write protection — never read-then-write

Every edit/archive mutation is a single `updateMany` whose `where` clause
includes the row's `id`, the caller's `expectedUpdatedAt`, and (for edits)
`isArchived: false` — `result.count === 1` is the sole authority for
"this write was accepted." A prior read to fetch the "current" row and
compare timestamps in application code would leave a window between the
read and the write for another edit to land unnoticed; the conditional
`updateMany` closes that window by making the comparison part of the same
atomic statement Postgres executes.

### 9. Party Income cell zero-semantics — no stored zero, archive-to-clear

`party_income_amount_positive` is a strict `CHECK ("amount" > 0)`, the same
as `daily_expenses`/`monthly_expenses` and unlike `counter_income`'s
`CHECK ("amount" >= 0)`. There is no way to store an explicit "entered as
zero" row for party income. Clearing a saved grid cell archives that row
(`archivePartyIncomeAction`) rather than writing `amount: "0"`; FR-PINC-09's
"shown as zero" applies only to a _computed_ range total when no row
exists at all, never to a stored row.

### 10. Grid autosave state machine, and why every successful save also calls `router.refresh()`

Each grid cell (`src/components/entries/GridCellInput.tsx`) is a small
state machine — idle → dirty (typing) → saving → saved / error / stale —
committing on blur or Enter (Tab moves focus natively across cells; no
custom Tab handling). Arrow-key navigation is gated on caret position for
left/right, so normal text-cursor movement inside a cell is never
hijacked. FR-PINC-08's row/party/grand totals are computed server-side,
not recalculated client-side on every keystroke (recalculating them
client-side per keystroke would mean re-deriving the same aggregation
logic twice, once server-side for the initial render and once client-side
for live updates — a second implementation to keep in sync with `src/lib/
domain`, for a per-cell feature this project's own simplicity mandate
(CON-07) does not ask for). **Decision:** every successful cell save also
calls `router.refresh()`, which re-fetches the grid's server data
(fresh totals included) without a full page reload. Each cell's own React
`key` folds in its `id`/`updatedAt`, so only the cell that actually
changed remounts — a cell the user has already tabbed/arrowed away from
keeps its own focus, verified directly (`document.activeElement` is still
an `<input>` after a save-triggered refresh, `tests/e2e/entries.spec.ts`
and manual verification alike).

A stale-write conflict (`status: "stale"`) is handled differently from a
generic error (`status: "error"`): retrying a stale write with the same
rejected `expectedUpdatedAt` would only fail again, so its action is
"Reload" (`router.refresh()`, remounting the cell with the row's real
current state via the key mechanism above) rather than "Retry" (which
simply re-attempts the same commit — correct for a transient failure,
wrong for a conflict that has already been resolved by someone else).

### 11. Counter Income's two-step duplicate confirmation — `confirmedDuplicate`, never a hard rejection

FR-CINC-04 requires a _warning_, not a rejection, when a counter-income
entry already exists for the chosen date. `createCounterIncomeAction`
checks `client_uuid` idempotency first (a retried request is always a
replay, never re-shown the warning); if no replay and `confirmedDuplicate`
is unset, a same-day non-archived row triggers `{ requiresConfirmation:
true, existingAmount }` without creating anything. The client
(`CounterIncomeForm.tsx`) shows the existing amount and a "Record Anyway"
button that resubmits the identical input with `confirmedDuplicate: true`
— the same `client_uuid` throughout, so this is a genuine continuation of
one attempt, not a second, unrelated create.

### 12. Archived-party historical visibility in the grid

`getPartyIncomeGrid` includes every currently-active daily-billing party
_plus_ any archived (`is_active = false`) daily-billing party that still
has at least one non-archived `DAILY` row within the selected month — the
caller renders that party's whole column read-only (every cell `readOnly`
and `disabled`) using the returned `isActive` flag, never omitting its
history. Proven in `tests/integration/queries/party-income-grid.test.ts`
for both directions: an archived party _with_ in-month history appears
(read-only); one _without_ any does not.

### 13. Closure: Daily Expense filters, edit/archive UI, and the shared money formatter

A follow-up closure pass completed three items this ADR's original
"Consequences" section had left open:

- **Filter controls** (`src/app/(app)/(operator)/daily-expenses/page.tsx`):
  a plain GET `<form>` (date range, item-or-description search, funding
  source) — no client JS needed, every value lands in the URL query string
  automatically and survives refresh/navigation for free. Server-side,
  `listDailyExpensesSchema` validates the raw query values (NFR-SEC-05);
  an invalid/malformed value is dropped, never thrown, since a filter
  narrows the view rather than being a required input. A "Reset Filters"
  link (plain `<a href="/daily-expenses">`) and a filter-aware empty-state
  message complete FR-DEXP-07.
- **Edit/archive UI** (`src/components/entries/{DailyExpenseFormFields,
DailyExpenseRowActions}.tsx`): the create drawer's five fields were
  extracted into a shared, purely presentational `DailyExpenseFormFields`
  component so the edit dialog is never a second, drifting copy of the
  same form. Edit and archive both submit the row's own `updatedAt` for
  the already-implemented atomic conditional-write check; a stale
  rejection surfaces the mutation's own error text plus a "Reload" action
  (`router.refresh()`), the same UX already established for the Party
  Income grid's stale-cell case.
- **`formatMoney`** (`src/lib/domain/money-format.ts`): one shared
  formatter (`"Rs 1,234.56"`, thousands separators, always two decimals)
  applied everywhere a Phase 3B screen displays an amount.

**A real bug found and fixed during this pass, worth recording**: the
formatter's first version imported `Decimal` as a _value_ from
`src/lib/domain/money.ts` (to call `.toFixed()`/`.abs()`/`.isNegative()`),
and `money.ts` itself imports `Prisma` from the generated Prisma client to
get that type. Once `formatMoney` was wired into two **Client Components**
(`PartyIncomeGrid`, `CashReceiptModal`), Turbopack tried to bundle the
generated Prisma client — a Node-only module — into the browser chunk and
crashed outright (`the chunking context (unknown) does not support
external modules (request: node:module)`), taking down `/party-income`
entirely (a 500 in dev, and the shared Playwright dev server left
unusable for every later test in the same run once it panicked). **Fix**:
`formatMoney` now takes only a _type-only_ import of `Decimal` (erased at
compile time) and formats via pure string manipulation — splitting on `.`,
padding/truncating the fractional part to 2 digits, regex-inserting
thousands separators — calling only `.toString()` on a `Decimal` argument
(a plain method every object has, not Decimal-specific), never
`.toFixed()`/`.abs()`/`.isNegative()`/`instanceof`. This is also why every
value actually passed to `formatMoney` from a Client Component is already
a plain string in practice: a live `Decimal` instance could never
legally cross the Server→Client props boundary anyway, since Next.js
requires serializable props. Verified by restarting the dev server after
the fix and confirming `/party-income` compiles and serves normally
(no panic), plus the full Playwright suite passing.

## Consequences

- The idempotency protocol (client-generated `client_uuid`, database-
  constraint-as-final-authority) is the one Phase 6's offline queue must
  reuse, not replace — a design constraint recorded here so it is not
  redesigned by accident later.
- `router.refresh()` on every successful grid-cell save (and now, every
  successful Daily Expense edit/archive) trades a small amount of network
  chatter for always-accurate totals — acceptable under CON-07 (a
  single-maintainer system; correctness of a financial total matters more
  than avoiding a refresh call), and verified not to disrupt
  keyboard-driven data entry.
- Any future shared module reachable from both Server and Client
  Components must avoid importing the generated Prisma client as a
  runtime value, even indirectly — a type-only import is safe (erased),
  a value import is not, regardless of how "small" the used API surface
  looks. `src/lib/domain/money-format.ts`'s fix (item above) is the
  concrete precedent to follow.
- FR-PINC-07/08's monthly-bill component (Phase 4, FR-PINC-03) remains
  the one still-open item from this ADR's original scope — tracked as
  `Partial` in `docs/REQUIREMENTS_TRACEABILITY.md`, not silently dropped.
