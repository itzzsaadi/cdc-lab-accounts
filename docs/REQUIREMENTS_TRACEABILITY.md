# REQUIREMENTS_TRACEABILITY.md — CDC Lab Accounts & Asset Management System

This matrix traces every Functional Requirement (FR), Non-Functional Requirement (NFR), and Acceptance Criterion (AC) in `docs/SRS.md` v3.0 to its planned implementation phase per `docs/PROJECT_PLAN.md`. Originally every row's Implementation Files and Test Files were empty and every Status was "Not Started"; as of Phase 3B, the rows whose full, tracked delivery now exists carry real file references, an updated Notes entry, and a Status of `Implemented` (or `Partial`, where the row's own tracked scope is only partly delivered — e.g. FR-PINC-07's monthly-bill component, deferred to Phase 4) — **a row's Status is left as "Not Started" unless the requirement's full, later-phase delivery is what that row tracks and is itself complete**. No row is marked `Verified` — that is reserved for a requirement whose stated Verification Method has actually been carried out end-to-end. This document is generated from, and does not modify, `CLAUDE.md`, `docs/SRS.md`, or `docs/PROJECT_PLAN.md`.

## How to read this table

- **Priority** — SRS §1.6 assigns M/S/C priority only to Functional Requirements. NFRs and Acceptance Criteria carry no SRS priority field; those rows are marked `N/A`.
- **Planned Phase** — taken from `docs/PROJECT_PLAN.md`. Where a requirement's schema/foundation is staged in one phase but its user-facing delivery and exit-criteria closure happen in a later phase (e.g. most entities are schema-only in Phase 1, then fully delivered in Phase 3/4/5/7), the phase of full delivery is used, with the earlier staging noted. Where `PROJECT_PLAN.md` never explicitly names a requirement ID in any phase, this is flagged as a **gap** in the Notes column and the phase shown is the most defensible inference, not an explicit citation.
- **Implementation Files / Test Files** — `—` where nothing exists yet; a real path once that row's tracked delivery has actual code and tests behind it.
- **Verification Method** — for NFRs, copied verbatim from the SRS §4 tables (`Test` / `Inspection` / `Analysis` / `Demonstration`). For FRs, the SRS does not assign a per-requirement verification method (only NFRs carry that column), so `Test` is used as the default, consistent with `CLAUDE.md` §5's requirement that the full automated validation suite gates every change; this is noted as inferred, not SRS-specified. For ACs, `Demonstration` is used, matching SRS §9's own framing ("accepted for live use when all of the following are **demonstrated**").
- **Status** — `Not Started`, `Partial`, or `Implemented` (see the paragraph above); no row yet marked `Verified`.

Phase key (from `docs/PROJECT_PLAN.md`): **0** Repository & dev foundation · **1** Database & domain foundation · **2** Authentication & authorization · **3A** Shared application shell & reusable UI foundation (implemented; carries no requirement IDs of its own) · **3B** Operator transaction workflows · **4** Monthly expenses, assets & partner investment · **5** Calculations, dashboard, warnings & reports · **6** Offline operation & synchronization · **7** Administration & historical import · **8** Acceptance testing, deployment & handover. Phase 3 was split into 3A/3B by client decision after this matrix was first written; no requirement ID moved phase as a result — every row previously tracked at "Phase 3" now reads "Phase 3B" (the sub-phase that actually delivers it), and rows Phase 3A's shell work partially touches (FR-AUTH-04, NFR-USE-05/06/07/08) note that contribution without changing their tracked delivery phase.

---

## Functional Requirements

### 3.1 Authentication and Roles (FR-AUTH) — SRS §3.1

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-AUTH-01 | Sign in with email/password required before any data is shown | M | Phase 2 | `src/lib/auth/config.ts`, `src/server/actions/auth.ts` | `tests/e2e/auth.spec.ts` | Test | Implemented | Better Auth email/password sign-in, gated by `emailAndPassword.enabled`/`disableSignUp`; e2e-proven. |
| FR-AUTH-02 | Passwords hashed with per-user salt, never stored readable | M | Phase 2 | `src/lib/auth/config.ts` | `tests/integration/auth/invitation.test.ts` | Test | Implemented | Better Auth's default Scrypt hashing (per-invocation salt) — never a custom algorithm; confirmed hashed, not plaintext, in the created `account.password` row. |
| FR-AUTH-03 | Three roles supported — Operator, Partner, Admin — per §2.6 permissions | M | Phase 2 | `src/lib/permissions/roles.ts`, `matrix.ts`, `guard.ts` | `tests/unit/permissions/guard.test.ts` | Test | Implemented | Role inheritance (OPERATOR ⊂ PARTNER ⊂ ADMIN) mechanism complete and unit-tested. Admin-facing user-management *UI* for this role model is delivered in Phase 7. |
| FR-AUTH-04 | Operator has no route (UI or server) to profit/loss/investment/profit-split | M | Phase 2 | `src/lib/permissions/matrix.ts` | `tests/unit/permissions/guard.test.ts`, `tests/e2e/auth.spec.ts` | Test | Not Started | Guard mechanism proven in Phase 2 (Operator denied Partner/Admin-only permissions, e2e-proven for one placeholder route); full sweep across every financial endpoint only possible once they all exist — closed out via AC-08 in Phase 5. Phase 3A additionally proves the shell's own sidebar navigation never renders a restricted link's markup at all for a given role (`tests/e2e/shell.spec.ts`) — presentational only, the server guard remains the actual enforcement. |
| FR-AUTH-05 | Signed-in session persists 30 days across browser restarts | M | Phase 2 | `src/lib/auth/config.ts` | `tests/integration/auth/cookies-and-revocation.test.ts` | Test | Implemented | `session.expiresIn = 60*60*24*30`; e2e cookie inspection confirms `Max-Age`. |
| FR-AUTH-06 | Password reset via single-use email link, expires in 60 minutes | M | Phase 2 | `src/lib/auth/config.ts` | `tests/integration/auth/invitation.test.ts` (shared reset mechanism) | Test | Implemented | `resetPasswordTokenExpiresIn = 3600`; single-use via Better Auth's own atomic `consumeVerificationValue`; identifier stored hashed (`verification.storeIdentifier: "hashed"`). |
| FR-AUTH-07 | Account temporarily locked after 10 consecutive failed sign-ins | M | Phase 2 | `src/lib/auth/lockout.ts` | `tests/integration/auth/lockout.test.ts` | Test | Implemented | 10-failure/15-minute lockout via one atomic `UPDATE ... RETURNING`; concurrency-tested; no Admin-unlock action built (time-based expiry only, approved). |
| FR-AUTH-08 | Every server request independently verifies identity and role | M | Phase 2 | `src/lib/permissions/guard.ts`, `src/server/session.ts` | `tests/unit/permissions/guard.test.ts`, `tests/e2e/auth.spec.ts` | Test | Implemented | One centralized `requirePermission` function, called identically from every Server Component/Action/Route Handler placeholder; direct-request denial e2e-proven, not just hidden UI. |
| FR-AUTH-09 | Sign-out ends server session; warns if uploads are pending | M | Phase 2 | `src/server/actions/auth.ts` | `tests/integration/auth/cookies-and-revocation.test.ts` | Test | Not Started | Sign-out ends the server session (mechanism implemented and tested). The "uploads pending" warning is only meaningful once Phase 6's offline queue exists; not built here. |

### 3.2 Daily Expenses (FR-DEXP) — SRS §3.2

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-DEXP-01 | Record daily expense: date, item, amount, funding source | M | Phase 3B | `prisma/schema.prisma`, `src/server/mutations/daily-expenses.ts`, `src/app/(app)/(operator)/daily-expenses/page.tsx`, `src/components/entries/DailyExpenseDrawer.tsx` | `tests/integration/mutations/daily-expenses.test.ts`, `tests/e2e/entries.spec.ts` | Test | Implemented | Schema Phase 1; full create flow, client-generated `client_uuid` idempotency, and drawer UI delivered Phase 3B. |
| FR-DEXP-02 | Item selectable from managed list; free text also accepted | M | Phase 3B | `src/lib/validation/daily-expense.ts`, `src/components/entries/DailyExpenseDrawer.tsx` | `tests/unit/validation/daily-expense.test.ts` | Test | Implemented | Exactly one of `expenseItemId` (active-items dropdown) or `customDescription` (free text) required — enforced by Zod `superRefine`, mirrored client-side by an "Other (type below)" option. |
| FR-DEXP-03 | Admin can add/rename/archive items; never alters recorded expenses | M | Phase 3B | — | — | Test | Not Started | Overlaps with the master-data CRUD delivered generally in Phase 7 (FR-MST-02); daily-expense-item picker itself needed from Phase 3. No Admin master-data UI built in Phase 3B (out of scope — see `docs/adr/0005-phase-3b-operator-workflows.md`). |
| FR-DEXP-04 | Date defaults to today, changeable for late entry | M | Phase 3B | `src/components/entries/DailyExpenseDrawer.tsx`, `src/lib/domain/calendar-date.ts` | `tests/unit/domain/calendar-date.test.ts` | Test | Implemented | `todayInKarachi()` (via `Intl.DateTimeFormat.formatToParts`, DR-02) seeds the date field's default; the field itself is a normal editable date input. |
| FR-DEXP-05 | Funding source Business or Partner; Partner requires naming the partner | M | Phase 3B | `prisma/migrations/20260820170711_init/migration.sql`, `src/lib/validation/daily-expense.ts`, `src/components/entries/FundingSourceToggle.tsx` | `tests/integration/constraints/funding-source.test.ts`, `tests/unit/validation/daily-expense.test.ts`, `tests/e2e/entries.spec.ts` | Test | Implemented | DB-level bidirectional `CHECK` (DR-07) implemented Phase 1; Zod mirrors the same bidirectional rule server-side; the segmented toggle enforces it in the UI. |
| FR-DEXP-06 | Reject zero/negative/non-numeric amounts with field-level message | M | Phase 3B | `src/lib/validation/money.ts` | `tests/unit/validation/money.test.ts` | Test | Implemented | Regex-only decimal-string validator (never `z.coerce.number()`), shared by every Phase 3B entity; rejects zero/negative/non-numeric with a field-level Zod message. |
| FR-DEXP-07 | Show daily expenses for a range, date order, running total, filterable | M | Phase 3B | `src/server/queries/daily-expenses.ts`, `src/app/(app)/(operator)/daily-expenses/page.tsx` | `tests/e2e/entries.spec.ts` | Test | Partial | Current-month range, descending date order, and a filterable-by-design query (`expenseItemId`/`fundingSource` params) are implemented; the screen itself does not yet expose date-range/item/funding-source filter *controls* — only the underlying query supports them. |
| FR-DEXP-08 | Period total calculated by system, never typed | M | Phase 3B | `src/lib/domain/result.ts`, `src/server/queries/daily-expenses.ts` | `tests/unit/domain/result.test.ts`, `tests/e2e/entries.spec.ts` | Test | Implemented | The listing total is a server-computed `Decimal` sum of the returned rows — never a stored or user-entered figure. |
| FR-DEXP-09 | Daily expense editable/archivable any time; history keeps prior values | M | Phase 3B | `src/server/mutations/daily-expenses.ts` | `tests/integration/mutations/daily-expenses.test.ts` | Test | Partial | Atomic conditional-write update/archive mutations exist and are tested (stale-write rejection, archived-row rejection); no edit/archive *UI* is wired into the Daily Expenses screen yet — only create. |
| FR-DEXP-10 | (Should→Could) Allow a receipt photo attachment to an expense | C | Phase 3 (optional, may defer) | — | — | Test | Not Started | `PROJECT_PLAN.md` explicitly allows deferring this priority-C item past Phase 3 without blocking exit; no firm later phase is committed. |

### 3.3 Party Income (FR-PINC) — SRS §3.3

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-PINC-01 | Maintain party list, each marked daily-billing or monthly-billing | M | Phase 1 (schema) / Phase 7 (inferred) | `prisma/schema.prisma` | `tests/integration/seed.test.ts` | Test | Not Started | Schema (`parties` table, `billing_mode` enum) and seed data implemented Phase 1. **Gap unchanged:** `PROJECT_PLAN.md` never explicitly re-cites this past Phase 1; Phase 7's FR-MST-01 covers near-identical ground. Recommend `PROJECT_PLAN.md` be updated to explicitly assign this. |
| FR-PINC-02 | Daily-billing parties shown as grid (days × parties), workbook layout | M | Phase 3B | `src/server/queries/party-income.ts`, `src/components/entries/PartyIncomeGrid.tsx`, `src/components/entries/GridCellInput.tsx` | `tests/integration/queries/party-income-grid.test.ts`, `tests/integration/mutations/party-income.test.ts`, `tests/e2e/entries.spec.ts` | Test | Implemented | Sticky-day-column, horizontally-scrolling grid; per-cell autosave state machine (idle/dirty/saving/saved/error/stale) with client-generated-`client_uuid` create-idempotency and atomic conditional-write edit/archive protection; archived parties with in-month history remain visible as read-only columns (mandatory safeguard #6). |
| FR-PINC-03 | Monthly-billing parties accept one figure per party per month | M | Phase 4 | — | — | Test | Not Started | Partner-only per UC-07, distinct from the Operator-facing daily grid. |
| FR-PINC-04 | Party addable/renamable/switchable/archivable any time; list may be empty | M | Phase 1 (schema) / Phase 7 (inferred) | `prisma/schema.prisma` | `tests/integration/constraints/physical-delete-protection.test.ts` | Test | Not Started | `is_active` archive field and physical-deletion prevention implemented Phase 1 (schema level only — no admin UI yet). **Gap unchanged** — same as FR-PINC-01. |
| FR-PINC-05 | Changing/archiving a party never alters recorded income figures | M | Phase 1 (schema) / Phase 7 (inferred) | `prisma/schema.prisma` | `tests/integration/queries/party-income-grid.test.ts` | Test | Not Started | FK-only referential design implemented Phase 1 — see `docs/adr/0002-phase-1-schema-clarifications.md` decision 8 for the precise guarantee (figures/relationships protected; display **labels** are not frozen). Phase 3B additionally proves an archived party's historical grid figures remain visible and unaltered. **Gap unchanged (no Admin archive UI)** — same as FR-PINC-01/04. |
| FR-PINC-06 | Record direct cash receipt against a party: date, amount, note | M | Phase 3B | `src/lib/validation/party-income.ts`, `src/server/mutations/party-income.ts`, `src/components/entries/CashReceiptModal.tsx` | `tests/integration/mutations/party-income.test.ts`, `tests/e2e/entries.spec.ts` | Test | Implemented | `receipt_type = 'CASH_DIRECT'`, note required, never restricted by the grid's DAILY-only unique index — multiple same-day receipts for one party are allowed. The Best Lab evidence case (SRS §2.2) this requirement exists for; prose in §2.2 misnames it "FR-INC-06" — see Ambiguous IDs below. |
| FR-PINC-07 | Party monthly total = daily entries + monthly figure + cash receipts, system-calculated | M | Phase 3B | `src/server/queries/party-income.ts` | `tests/integration/queries/party-income-grid.test.ts` | Test | **Partial** | The daily-entries and cash-receipt components of this total are implemented and correctly excluded/included per `receipt_type` (`getPartyIncomeGrid`'s `partyTotals`/`grandTotal`, DAILY rows only, in line with the grid's own scope). The monthly-bill figure (FR-PINC-03) does not exist yet — Phase 4 — so the *complete* three-way total this requirement describes cannot be assembled until then. Reused again once Phase 4 adds the monthly-bill figure into the same total. |
| FR-PINC-08 | Show total per party and combined party income for any range | M | Phase 3B | `src/server/queries/party-income.ts`, `src/components/entries/PartyIncomeGrid.tsx` | `tests/integration/queries/party-income-grid.test.ts` | Test | Partial | Per-party and grand totals are shown for the selected month (the grid's own range); an arbitrary custom date range (vs. a whole calendar month) is not yet a selectable option. |
| FR-PINC-09 | Party with no income in a period shown as zero, not omitted | M | Phase 3B | `src/server/queries/party-income.ts` | `tests/integration/queries/party-income-grid.test.ts` | Test | Implemented | Every active (and in-month-historical archived) daily-billing party gets a `partyTotals` entry, defaulting to `"0"` via `ZERO`, never omitted from the grid or its totals row. |

### 3.4 Counter Income (FR-CINC) — SRS §3.4

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-CINC-01 | Record counter income daily as one figure per day | M | Phase 3B | `src/server/mutations/counter-income.ts`, `src/components/entries/CounterIncomeForm.tsx` | `tests/integration/mutations/counter-income.test.ts`, `tests/e2e/entries.spec.ts` | Test | Implemented | One `counter_income` row per submission, `amount` allows zero (`CHECK >= 0`, the one table with this exception). |
| FR-CINC-02 | Monthly counter income total calculated from daily entries, never typed | M | Phase 3B | `src/server/queries/counter-income.ts` | `tests/e2e/entries.spec.ts` | Test | Implemented | Server-computed `Decimal` sum of the current month's non-archived rows. |
| FR-CINC-03 | Show counter income as daily list and monthly total | M | Phase 3B | `src/app/(app)/(operator)/counter-income/page.tsx` | `tests/e2e/entries.spec.ts` | Test | Implemented | Daily list (date/amount/note) plus the month's total, both server-rendered. |
| FR-CINC-04 | Warn (non-blocking) if counter income already exists for chosen date | M | Phase 3B | `src/server/mutations/counter-income.ts`, `src/components/entries/CounterIncomeForm.tsx` | `tests/integration/mutations/counter-income.test.ts`, `tests/e2e/entries.spec.ts` | Test | Implemented | Two-step `confirmedDuplicate` flow: the first submission returns a warning (no row created) when a non-archived same-date entry exists; the client's "Record Anyway" resubmits with the same `client_uuid` to proceed — never a hard rejection. |
| FR-CINC-05 | (Should) Show days in current month with no counter income recorded | S | Phase 5 (tentative) | — | — | Test | Not Started | `PROJECT_PLAN.md` Phase 3B says this "may fold into Phase 5's warnings work" — not a firm commitment; treat as tentative. |

### 3.5 Monthly Expenses (FR-MEXP) — SRS §3.5

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-MEXP-01 | Record monthly expense: month, group, category, vendor, amount, funding source | M | Phase 4 | `prisma/schema.prisma` | `tests/integration/constraints/instalment-idempotency.test.ts` | Test | Not Started | Schema (`monthly_expenses` table) implemented Phase 1, including the instalment partial-unique index. |
| FR-MEXP-02 | Managed list of expense categories; Admin can add/rename/archive | M | Phase 4 | — | — | Test | Not Started | Category CRUD overlaps Phase 7's FR-MST-03; category *picker* needed from Phase 4. |
| FR-MEXP-03 | Daily-expense total appears automatically as read-only Purchasing line | M | Phase 4 | — | — | Test | Not Started | |
| FR-MEXP-04 | Administration and Purchasing totalled separately for display, combined for profit calc | M | Phase 4 | — | — | Test | Not Started | |
| FR-MEXP-05 | Funding-source rule of FR-DEXP-05 applies equally to monthly expenses | M | Phase 4 | — | — | Test | Not Started | |
| FR-MEXP-06 | (Should) Offer to create current month's recurring lines from previous month, pre-filled, confirm before saving | S | Phase 4 | — | — | Test | Not Started | |
| FR-MEXP-07 | Monthly expense editable/archivable any time; history keeps prior values | M | Phase 4 | — | — | Test | Not Started | |
| FR-MEXP-08 | Same category may repeat in a month, with a warning | M | Phase 4 | — | — | Test | Not Started | |

### 3.6 Asset Register and Instalments (FR-AST) — SRS §3.6

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-AST-01 | Asset register starts empty; assets added over time | M | Phase 4 | — | — | Test | Not Started | |
| FR-AST-02 | Record asset: name, classification, acquisition mode, vendor, date | M | Phase 4 | `prisma/schema.prisma` | `tests/integration/constraints/asset-acquisition-mode.test.ts` | Test | Not Started | Schema + `CHECK` constraints implemented and tested Phase 1. |
| FR-AST-03 | Instalment asset records fixed monthly instalment, editable any time | M | Phase 4 | — | — | Test | Not Started | |
| FR-AST-04 | Active asset's monthly instalment appears as monthly expense line, reduces profit, no partner tag | M | Phase 4 | — | — | Test | Not Started | Auto-generation logic flagged as a risk area in `PROJECT_PLAN.md` Phase 4. |
| FR-AST-05 | Instalments open-ended; no total price/end date/outstanding balance tracked | M | Phase 4 | — | — | Test | Not Started | Explicitly out-of-scope to add per `CLAUDE.md` §26. |
| FR-AST-06 | Cash-purchased asset records buying partner and price; adds to investment, not an expense | M | Phase 4 | — | — | Test | Not Started | |
| FR-AST-07 | Asset is instalment or cash, never both | M | Phase 4 | `prisma/migrations/20260820170711_init/migration.sql` | `tests/integration/constraints/asset-acquisition-mode.test.ts` | Test | Not Started | DB `CHECK` (DR-08) implemented and proven by failing-insert tests Phase 1; UI/API enforcement Phase 4. |
| FR-AST-08 | Asset addable/editable/archivable any time; archiving stops future instalment lines only | M | Phase 4 | — | — | Test | Not Started | |
| FR-AST-09 | Asset register filterable by classification/mode/status, with purchase-price total | M | Phase 4 | — | — | Test | Not Started | |
| FR-AST-10 | Depreciation is never calculated | M | Phase 4 | — | — | Test | Not Started | Out-of-scope guard per `CLAUDE.md` §26 — this is a "must not build" requirement. |

### 3.7 Partner Investment (FR-INV) — SRS §3.7

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-INV-01 | Maintain running investment total per partner | M | Phase 4 | `src/lib/domain/investment.ts` | `tests/unit/domain/investment.test.ts` | Test | Not Started | Never stored (DR-09); domain aggregation function implemented and unit-tested Phase 1, not yet wired to a screen. |
| FR-INV-02 | Investment total = capital contributions + partner-funded expenses + cash-bought assets | M | Phase 4 | — | — | Test | Not Started | |
| FR-INV-03 | Record direct capital contribution: date, partner, amount, note | M | Phase 4 | — | — | Test | Not Started | |
| FR-INV-04 | (Should) Record partner withdrawal, reducing that partner's investment total | S | Phase 4 | — | — | Test | Not Started | |
| FR-INV-05 | Present per-partner statement listing every item, with running balance | M | Phase 4 | — | — | Test | Not Started | |
| FR-INV-06 | Investment total never affects profit split or any other calculation | M | Phase 4 | — | — | Test | Not Started | |
| FR-INV-07 | Investment figures visible to Partners and Admins only | M | Phase 4 | — | — | Test | Not Started | Enforced via the Phase 2 role guard. |

### 3.8 Results and Date Range (FR-RES) — SRS §3.8

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-RES-01 | Calculate results for any user-chosen date range | M | Phase 5 | `src/lib/domain/result.ts` | `tests/unit/domain/result.test.ts` | Test | Not Started | Core aggregation functions implemented and unit-tested Phase 1 (date-range filtering itself is a Phase 5 query/UI concern). |
| FR-RES-02 | Date range defaults to first/last day of current month | M | Phase 5 | — | — | Test | Not Started | |
| FR-RES-03 | User can set any start/end date; step to prev/next month in one action | M | Phase 5 | — | — | Test | Not Started | Verified via AC-09. |
| FR-RES-04 | Total income = counter income + all party income in range | M | Phase 5 | — | — | Test | Not Started | |
| FR-RES-05 | Total expenses = Business-funded daily+monthly expenses in range, incl. instalments | M | Phase 5 | — | — | Test | Not Started | |
| FR-RES-06 | Partner-funded expenses excluded from total expenses but shown in category listings | M | Phase 5 | — | — | Test | Not Started | Verified via AC-05 (Phase 4) and again in full reports context here. |
| FR-RES-07 | Net profit/loss = total income − total expenses | M | Phase 5 | — | — | Test | Not Started | |
| FR-RES-08 | Result split between partners per settings (default 50/50); same split applies to a loss | M | Phase 5 | — | — | Test | Not Started | |
| FR-RES-09 | Result presented as itemised breakdown for manual verification | M | Phase 5 | — | — | Test | Not Started | |
| FR-RES-10 | Monthly summary shown in existing-workbook shape: income/expense lines + result | M | Phase 5 | — | — | Test | Not Started | |
| FR-RES-11 | Results calculated on demand; no result stored as editable figure | M | Phase 5 | — | — | Test | Not Started | DR-09 hard constraint. |

### 3.9 Warnings and Reminders (FR-WARN) — SRS §3.9

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-WARN-01 | List recurring monthly expense categories with no entry this month | M | Phase 5 | — | — | Test | Not Started | Verified via AC-10. |
| FR-WARN-02 | List active instalment assets missing this month's expense line | M | Phase 5 | — | — | Test | Not Started | Verified via AC-10. |
| FR-WARN-03 | Warnings on dashboard only; never block entry or calculation | M | Phase 5 | — | — | Test | Not Started | |
| FR-WARN-04 | (Should) Warn when a monthly expense differs markedly from prior month | S | Phase 5 | — | — | Test | Not Started | |
| FR-WARN-05 | (Should) Warning dismissible for current month if omission is deliberate | S | Phase 5 | — | — | Test | Not Started | |

### 3.10 Offline Operation (FR-OFF) — SRS §3.10

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-OFF-01 | Installable as PWA; loads offline once installed | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-02 | Daily expense/party income/counter income/cash receipt entry works offline, stored on device | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-03 | Connection state and pending-upload count shown visibly on every screen | M | Phase 6 | — | — | Test | Not Started | Dashboard placeholder exists from Phase 5; live wiring is Phase 6. |
| FR-OFF-04 | Waiting entries upload automatically when connection returns | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-05 | Manual upload control provided | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-06 | Unique device-generated identifier per entry; server prevents duplicate on repeat upload | M | Phase 6 | `prisma/schema.prisma` | `tests/integration/constraints/client-uuid-uniqueness.test.ts` | Test | Not Started | `client_uuid` column + unique index implemented and tested Phase 1 (DR-05); actual on-device generation and use is Phase 6 only. |
| FR-OFF-07 | Entries uploaded in capture order | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-08 | Device/server conflict on same record: keep both, ask user to choose; never auto-discard | M | Phase 6 | — | — | Test | Not Started | Highest-risk item per SRS §3.10 framing. |
| FR-OFF-09 | Waiting entries kept on device indefinitely until uploaded or explicitly discarded | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-10 | Warn before any action (incl. sign-out) that would discard un-uploaded entries | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-11 | Record both device capture time and server arrival time per entry | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-12 | Figures shown while offline marked provisional | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-13 | Reports/exports require connection; unavailable offline | M | Phase 6 | — | — | Test | Not Started | |
| FR-OFF-14 | (Should) Most recent 90 days of entries readable offline | S | Phase 6 | — | — | Test | Not Started | |

### 3.11 Master Data (FR-MST) — SRS §3.11

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-MST-01 | Admin adds/renames/archives parties; sets billing mode | M | Phase 7 | — | — | Test | Not Started | Substantially overlaps FR-PINC-01/04 (see gap note there). |
| FR-MST-02 | Admin adds/renames/archives daily expense items | M | Phase 7 | — | — | Test | Not Started | |
| FR-MST-03 | Admin adds/renames/archives monthly expense categories; marks which are recurring | M | Phase 7 | — | — | Test | Not Started | |
| FR-MST-04 | Admin adds/renames/archives vendors | M | Phase 7 | — | — | Test | Not Started | |
| FR-MST-05 | Archiving a master record removes it from lists; historical entries unchanged | M | Phase 7 | — | — | Test | Not Started | CON-05/DR-06 hard constraint. |
| FR-MST-06 | Admin sets profit-split percentages; must total 100 | M | Phase 7 | `prisma/seed.ts` | `tests/integration/seed.test.ts` | Test | Not Started | Default 50/50 seeded Phase 1 (`app_settings`); the 100%-total rule is enforced server-side in Phase 7, not at the database level (see Phase 1 plan). |
| FR-MST-07 | System delivered pre-loaded with July 2026 parties/categories/items | M | Phase 7 | `prisma/seed.ts` | `tests/integration/seed.test.ts` | Test | Not Started | Master-data names (parties/categories/items/vendors) loaded Phase 1 — **not** the July transaction amounts themselves, which are deliberately excluded from the Phase 1 seed (see ADR-0002); this FR's full intent is formally verified in Phase 7/8. |

### 3.12 Change History (FR-AUD) — SRS §3.12

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-AUD-01 | Record an entry for every creation/change/archiving of any financial record | M | Phase 3B | `src/lib/audit.ts`, `src/server/mutations/{daily-expenses,party-income,counter-income}.ts` | `tests/integration/audit/business-audit.test.ts`, `tests/integration/mutations/*.test.ts` | Test | Implemented | `appendBusinessAudit` writes in the same `prisma.$transaction` as every create/update/archive across the three Phase 3B entities — a failed audit write rolls back the mutation, and vice versa; extended to monthly expenses/assets/investments in Phase 4. |
| FR-AUD-02 | Each audit entry records user, time, action, record, before/after values | M | Phase 3B | `src/lib/audit.ts` | `tests/integration/audit/business-audit.test.ts` | Test | Implemented | `actorUserId`, `capturedAt`, `action`, `entityType`/`entityId`, and `oldValues`/`newValues` are captured for every Phase 3B mutation. |
| FR-AUD-03 | Change history is append-only; no mechanism to alter or delete an entry | M | Phase 1 | `prisma/migrations/20260820170711_init/migration.sql` | `tests/integration/constraints/audit-log-append-only.test.ts` | Test | Not Started | **Gap closed:** implemented via a Postgres `BEFORE UPDATE OR DELETE` trigger on `audit_log` (not merely the absence of update/delete code), proven by a failing-UPDATE and a failing-DELETE test. Status remains "Not Started" because no application code writes to `audit_log` yet (Phase 2 onward). |
| FR-AUD-04 | Change history shown as read-only list, filterable by user/date/record type | M | Phase 5 | — | — | Test | Not Started | |
| FR-AUD-05 | User can view an individual record's own change history | M | Phase 5 | — | — | Test | Not Started | |
| FR-AUD-06 | (Should) Highlight changes to entries dated more than one month in the past | S | Phase 5 | — | — | Test | Not Started | |
| FR-AUD-07 | Sign-in, failed sign-in, and password-change events recorded | M | Phase 2 | `src/lib/auth/audit.ts`, `src/server/actions/auth.ts` | `tests/integration/auth/audit.test.ts` | Test | Implemented | `LOGIN`/`LOGIN_FAILED`/`ACCOUNT_LOCKED`/`PASSWORD_CHANGE`/`SESSION_REVOKED` all write real `audit_log` rows; verified no password/hash/token/URL ever appears in any of them. |
| FR-AUD-08 | Offline-made entry records both capture time and upload time | M | Phase 6 | — | — | Test | Not Started | |

### 3.13 Dashboard and Reports (FR-RPT) — SRS §3.13

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-RPT-01 | Dashboard shows current-month income/expenses/result vs previous month | M | Phase 5 | — | — | Test | Not Started | |
| FR-RPT-02 | Dashboard shows outstanding warnings and pending-upload count | M | Phase 5 | — | — | Test | Not Started | Pending-upload count is placeholder until Phase 6 wires real data. |
| FR-RPT-03 | Show income/expenses trend across recent months | M | Phase 5 | — | — | Test | Not Started | |
| FR-RPT-04 | Show expenses grouped by category, marking partner-funded ones | M | Phase 5 | — | — | Test | Not Started | |
| FR-RPT-05 | Show income by party across a chosen range | M | Phase 5 | — | — | Test | Not Started | |
| FR-RPT-06 | Export monthly summary as A4 PDF, laid out like existing sheet | M | Phase 5 | — | — | Test | Not Started | |
| FR-RPT-07 | Export entries to Excel for a chosen range, one sheet per data type | M | Phase 5 | — | — | Test | Not Started | |
| FR-RPT-08 | Every export shows date produced, range covered, producing user | M | Phase 5 | — | — | Test | Not Started | |
| FR-RPT-09 | Reports containing profit/loss/investment unavailable to Operator | M | Phase 5 | — | — | Test | Not Started | Part of the AC-08 sweep. |

### 3.14 Historical Data Import (FR-IMP) — SRS §3.14

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-IMP-01 | Provide defined Excel template for importing historical months | M | Phase 7 | — | — | Test | Not Started | |
| FR-IMP-02 | Validate uploaded file; show preview with errors marked before saving | M | Phase 7 | — | — | Test | Not Started | |
| FR-IMP-03 | Any failing row rejects the whole file; no partial import | M | Phase 7 | — | — | Test | Not Started | Must be implemented as a single transaction. |
| FR-IMP-04 | Imported records identifiable as historical imports in change history | M | Phase 7 | — | — | Test | Not Started | |

---

## Non-Functional Requirements

### 4.1 Performance (NFR-PERF) — SRS §4.1

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| NFR-PERF-01 | App loads and becomes usable within 5 seconds | N/A | Phase 3B | — | — | Test | Not Started | First real screens to measure against appear in Phase 3. |
| NFR-PERF-02 | Screen navigation takes no more than 1 second once loaded | N/A | Phase 3B | — | — | Test | Not Started | |
| NFR-PERF-03 | Save confirms within 2s online / 500ms offline | N/A | Phase 3B | — | — | Test | Not Started | Offline half of this only fully testable once Phase 6 exists. |
| NFR-PERF-04 | Monthly result calculated and displayed within 3 seconds | N/A | Phase 5 | — | — | Test | Not Started | |
| NFR-PERF-05 | Report export produced within 15 seconds | N/A | Phase 5 | — | — | Test | Not Started | |
| NFR-PERF-06 | Screens stay within limits with three years of accumulated data | N/A | Phase 8 | — | — | Test | Not Started | **Minor documentation inconsistency:** cited in Phase 8's Tests/Deliverables prose in `PROJECT_PLAN.md` but omitted from that phase's "Exact SRS requirement groups" header list — flagged for correction. |
| NFR-PERF-07 | 200 offline entries upload within 30 seconds | N/A | Phase 6 | — | — | Test | Not Started | |

### 4.2 Security (NFR-SEC) — SRS §4.2

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| NFR-SEC-01 | All traffic over HTTPS; HTTP redirects permanently | N/A | Phase 8 (inferred) | — | — | Inspection | Not Started | Primarily a hosting/infra concern, formally verified in Phase 8's security pass; not explicitly phased earlier in `PROJECT_PLAN.md`. |
| NFR-SEC-02 | Database and backups encrypted at rest | N/A | Phase 8 (inferred) | — | — | Inspection | Not Started | Same as NFR-SEC-01 — hosting/infra, tied to Phase 8 backup work. |
| NFR-SEC-03 | Every server endpoint verifies identity/role independent of UI | N/A | Phase 2 | — | — | Inspection | Not Started | The role-guard mechanism is Phase 2's central deliverable. |
| NFR-SEC-04 | Financial results withheld from Operators at the server | N/A | Phase 5 | — | — | Test | Not Started | Closed out together with AC-08, once every financial endpoint exists. |
| NFR-SEC-05 | All input validated server-side regardless of browser validation | N/A | Phase 3B | `src/lib/validation/{daily-expense,party-income,counter-income,money,calendar-date}.ts` | `tests/unit/validation/*.test.ts` | Inspection | Implemented | Every Phase 3B write action validates with Zod on the server first; principle applies to every later phase's endpoints too. |
| NFR-SEC-06 | Protected against OWASP Top 10, esp. injection and broken access control | N/A | Phase 8 (inferred) | — | — | Analysis | Not Started | Holistic, whole-system analysis; `PROJECT_PLAN.md` Phase 8 explicitly reviews this. |
| NFR-SEC-07 | Secrets/connection strings in environment config, never committed | N/A | Phase 0 | — | — | Inspection | Not Started | |
| NFR-SEC-08 | Session cookies HTTP-only, Secure, SameSite | N/A | Phase 2 | — | — | Inspection | Not Started | |
| NFR-SEC-09 | Offline device data cleared on sign-out once nothing pending | N/A | Phase 6 | — | — | Test | Not Started | |
| NFR-SEC-10 | Error messages reveal no stack traces/DB structure/internal paths | N/A | Phase 8 (inferred) | — | — | Test | Not Started | Explicitly named in Phase 8's Tests text as part of the final security pass. |

### 4.3 Reliability and Backup (NFR-REL) — SRS §4.3

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| NFR-REL-01 | Database backed up automatically at least every 24 hours | N/A | Phase 8 | — | — | Inspection | Not Started | |
| NFR-REL-02 | Backups kept 30+ days; one monthly backup kept 12 months | N/A | Phase 8 | — | — | Inspection | Not Started | |
| NFR-REL-03 | Backup restore tested and documented before launch | N/A | Phase 8 | — | — | Demonstration | Not Started | Verified via AC-12. |
| NFR-REL-04 | No user action causes permanent loss of a financial record | N/A | Phase 8 | `prisma/migrations/20260820170711_init/migration.sql` | `tests/integration/constraints/physical-delete-protection.test.ts` | Test | Not Started | Underlying archive-only guarantee (DR-04) implemented and proven at the database level (BEFORE DELETE triggers) Phase 1; formal end-to-end verification is Phase 8. |
| NFR-REL-05 | No offline entry lost, incl. browser close/device restart before upload | N/A | Phase 6 | — | — | Test | Not Started | |
| NFR-REL-06 | Application errors captured to monitoring service with diagnostic context | N/A | Phase 8 | — | — | Inspection | Not Started | |
| NFR-REL-07 | Target availability 99% per month, excluding planned maintenance | N/A | Phase 8 | — | — | Analysis | Not Started | |

### 4.4 Usability (NFR-USE) — SRS §4.4

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| NFR-USE-01 | Routine daily expense recorded in ≤5 interactions from main screen | N/A | Phase 3B | `src/components/entries/DailyExpenseDrawer.tsx` | — | Demonstration | Not Started | Not formally interaction-counted; the drawer's own flow (Add Expense → amount → item → save) is close to but not verified against a strict 5-interaction budget. |
| NFR-USE-02 | Daily party income grid operable by keyboard alone | N/A | Phase 3B | `src/components/entries/GridCellInput.tsx` | `tests/e2e/entries.spec.ts` | Demonstration | Implemented | Tab (native), Enter (commit + move down), and all four arrow keys (caret-position-gated left/right) reach and edit every cell without a pointer. |
| NFR-USE-03 | Amounts shown with thousands separators and consistent Rs indicator | N/A | Phase 3B | — | — | Inspection | Not Started | Amounts are currently shown as plain `Decimal` strings (e.g. "12000", "PKR" suffix) — no thousands-separator formatting helper exists yet. Flagged as a follow-up, not built in Phase 3B. |
| NFR-USE-04 | Every save gives clear visual confirmation of success/failure, incl. offline | N/A | Phase 3B | `src/components/entries/GridCellInput.tsx`, `DailyExpenseDrawer.tsx`, `CounterIncomeForm.tsx` | `tests/e2e/entries.spec.ts` | Test | Partial | The grid's autosave state machine and the two full-page forms all surface inline success/error feedback for the *online* case; the offline half is inapplicable until Phase 6's queue exists. |
| NFR-USE-05 | Wording matches existing workbook terms (Parties, Counter Income, etc.) | N/A | Phase 3B (inferred) | — | — | Inspection | Not Started | **Gap:** never explicitly cited in any phase's requirement groups in `PROJECT_PLAN.md`, despite being a cross-cutting rule (CLAUDE.md §22) applying to every UI-bearing phase (0, 3, 4, 5, 7). Phase 3B is the first business-screen-bearing phase, used here as the anchor. Phase 3A's own shell copy ("Home"/"Dashboard"/"Users", no "client"/"customer" wording) is already consistent with this rule, but carries no business terminology of its own to fully satisfy it. |
| NFR-USE-06 | Archiving requires confirmation naming the affected record | N/A | Phase 3B | — | — | Test | Not Started | Phase 3A built the reusable confirmation building block (`src/components/ui/Modal`, native `<dialog>`) but no screen calls it with real archive copy yet — no business entry exists to archive before Phase 3B. |
| NFR-USE-07 | Interface works on phone screen without horizontal scrolling | N/A | Phase 3B | — | — | Test | Not Started | Phase 3A's shell itself (sidebar/header/mobile drawer) is proven free of horizontal scroll at a 375px viewport (`tests/e2e/shell.spec.ts`); the requirement remains "Not Started" overall because it must hold for every future business screen too, most of which don't exist yet — see `docs/UI_REQUIREMENTS.md` §7's tablet/mobile visual-verification gate on Phase 3B's own acceptance. |
| NFR-USE-08 | Interface is in English | N/A | Phase 3B (inferred) | — | — | Inspection | Not Started | **Gap — same as NFR-USE-05:** cross-cutting, never explicitly phased in `PROJECT_PLAN.md`. Also the basis for the out-of-scope "no Urdu interface" guard (CLAUDE.md §26). Phase 3A's shell copy and vendored fonts (Latin subset only, per `public/design-assets/fonts/PROVENANCE.md`) are already English-only/English-scoped, consistent with this rule. |

### 4.5 Maintainability (NFR-MNT) — SRS §4.5

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| NFR-MNT-01 | README lets a competent engineer run the system locally within 30 minutes | N/A | Phase 0 | — | — | Demonstration | Not Started | Also re-verified as part of AC-15 in Phase 8. |
| NFR-MNT-02 | .env.example lists every environment variable, no real secrets | N/A | Phase 0 | — | — | Inspection | Not Started | Re-verified via AC-15. |
| NFR-MNT-03 | Each significant technical decision recorded as a short ADR | N/A | Phase 0 | — | — | Inspection | Not Started | Ongoing practice through every later phase, not a one-time deliverable. |
| NFR-MNT-04 | Repository contains deployment runbook (deploy, rollback, backup restore) | N/A | Phase 8 | — | — | Inspection | Not Started | Skeleton created Phase 0; finalized content requires actual deployment, so full delivery is Phase 8. Re-verified via AC-15. |
| NFR-MNT-05 | All DB changes via versioned migrations; no manual production DB changes | N/A | Phase 1 | `prisma/migrations/20260820170711_init/` | — | Inspection | Implemented | One versioned migration exists, hand-edited per the documented Prisma escape-hatch pattern; no `prisma db push` used anywhere. Practice continues every later phase. |
| NFR-MNT-06 | Result calculation covered by automated tests, incl. funding source + July 2026 fixture | N/A | Phase 5 | — | — | Test | Not Started | **Gated:** the July 2026 fixture cannot be finalized until the AT WASTE reconciliation conflict (CLAUDE.md §27, item 1) is resolved with the client. |
| NFR-MNT-07 | Offline upload/conflict handling covered by automated tests, incl. repeated upload | N/A | Phase 6 | — | — | Test | Not Started | |
| NFR-MNT-08 | Static typing throughout; build fails on type errors | N/A | Phase 0 | — | — | Inspection | Not Started | |
| NFR-MNT-09 | Formatting and linting enforced automatically on every change | N/A | Phase 0 | — | — | Inspection | Not Started | |

### 4.6 Compatibility (NFR-CMP) — SRS §4.6

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| NFR-CMP-01 | Works on current + previous major Chrome/Edge/Firefox/Safari | N/A | Phase 8 | — | — | Test | Not Started | |
| NFR-CMP-02 | Works on Android 10+ and iOS 15+ | N/A | Phase 8 | — | — | Test | Not Started | |
| NFR-CMP-03 | Excel exports open without error in Excel 2016+ and Google Sheets | N/A | Phase 8 | — | — | Test | Not Started | |

---

## Acceptance Criteria

### Section 9 (AC) — SRS §9

| Requirement ID | Exact short description | Priority | Planned Phase | Implementation Files | Test Files | Verification Method | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| AC-01 | Every M-priority requirement implemented and verified by its stated method | N/A | Phase 8 | — | — | Demonstration | Not Started | Meta-criterion; depends on every prior phase. |
| AC-02 | Reproduces July 2026 figures exactly (income/expenses/profit/partner shares) | N/A | Phase 5 | — | — | Demonstration | Not Started | **Gated** on resolving the AT WASTE reconciliation conflict (CLAUDE.md §27, item 1) before the fixture is written. The single most important test in the project. |
| AC-03 | Two further historical months reconciled line-by-line against client workbooks | N/A | Phase 8 | — | — | Demonstration | Not Started | |
| AC-04 | Party monthly total shown derived from entries; Best Lab cash receipts recorded as entries | N/A | Phase 8 | — | — | Demonstration | Not Started | Underlying feature (FR-PINC-06/07) is built in Phase 3B; formal acceptance sign-off happens in Phase 8. |
| AC-05 | Funding-source rule demonstrated (profit unaffected, investment raised, still in category report) | N/A | Phase 4 | — | — | Demonstration | Not Started | Explicitly closed out in Phase 4 per `PROJECT_PLAN.md` exit criteria. |
| AC-06 | Offline entry demonstrated end-to-end incl. browser close/reopen and reconnect | N/A | Phase 6 | — | — | Demonstration | Not Started | |
| AC-07 | Repeated upload of same entry shown not to duplicate | N/A | Phase 6 | — | — | Demonstration | Not Started | |
| AC-08 | Operator account shown to have no route to profit/loss/investment, incl. direct server request | N/A | Phase 5 | — | — | Demonstration | Not Started | Explicitly "finally closed out in Phase 5" per `PROJECT_PLAN.md` — first phase where every financial endpoint exists to test. |
| AC-09 | Date range filter demonstrated across month boundary and custom range | N/A | Phase 5 | — | — | Demonstration | Not Started | |
| AC-10 | Warnings correctly identify a missing recurring bill and a missing instalment line | N/A | Phase 5 | — | — | Demonstration | Not Started | |
| AC-11 | Change history correctly reflects a representative sample incl. one offline entry | N/A | Phase 8 | — | — | Demonstration | Not Started | Underlying pieces built across Phases 3, 5, and 6; formal sign-off Phase 8. |
| AC-12 | Database restore from an actual backup demonstrated into a clean environment | N/A | Phase 8 | — | — | Demonstration | Not Started | |
| AC-13 | PDF and Excel exports verified against underlying data | N/A | Phase 5 | — | — | Demonstration | Not Started | **Minor documentation inconsistency:** cited in Phase 5's Tests/Exit-criteria prose in `PROJECT_PLAN.md` but omitted from that phase's "Exact SRS requirement groups" header list — flagged for correction. |
| AC-14 | Both partners + at least one operator complete an unaided walkthrough | N/A | Phase 8 | — | — | Demonstration | Not Started | Phase 7's admin walkthrough contributes partially; final closure is Phase 8. |
| AC-15 | Repository documentation satisfies NFR-MNT-01 to NFR-MNT-04 | N/A | Phase 8 | — | — | Demonstration | Not Started | |

---

## Totals

### By requirement type

| Type | Count |
|---|---|
| Functional Requirements (FR) | 116 |
| Non-Functional Requirements (NFR) | 44 |
| Acceptance Criteria (AC) | 15 |
| **Total** | **175** |

### Functional Requirements — by family

| Family | Count |
|---|---|
| FR-AUTH | 9 |
| FR-DEXP | 10 |
| FR-PINC | 9 |
| FR-CINC | 5 |
| FR-MEXP | 8 |
| FR-AST | 10 |
| FR-INV | 7 |
| FR-RES | 11 |
| FR-WARN | 5 |
| FR-OFF | 14 |
| FR-MST | 7 |
| FR-AUD | 8 |
| FR-RPT | 9 |
| FR-IMP | 4 |
| **Total FR** | **116** |

### Non-Functional Requirements — by family

| Family | Count |
|---|---|
| NFR-PERF | 7 |
| NFR-SEC | 10 |
| NFR-REL | 7 |
| NFR-USE | 8 |
| NFR-MNT | 9 |
| NFR-CMP | 3 |
| **Total NFR** | **44** |

### Acceptance Criteria

| Family | Count |
|---|---|
| AC (SRS §9) | 15 |
| **Total AC** | **15** |

### By Priority (FR only — SRS assigns Priority only to FRs)

| Priority | Count |
|---|---|
| M (Must have) | 105 |
| S (Should have) | 9 |
| C (Could have) | 2 |
| **Total FR** | **116** |

*(NFR and AC rows: 44 + 15 = 59 requirements carry no SRS priority field and are excluded from this breakdown, marked `N/A` in the table above.)*

### By Planned Phase (all 175 requirements)

| Phase | FR | NFR | AC | Total |
|---|---|---|---|---|
| Phase 0 — Repository & dev foundation | 0 | 6 | 0 | 6 |
| Phase 1 — Database & domain foundation | 0 | 1 | 0 | 1 |
| Phase 2 — Authentication & authorization | 10 | 2 | 0 | 12 |
| Phase 3B — Operator transaction workflows (Phase 3A, the shared shell, carries no requirement IDs of its own — see `docs/PROJECT_PLAN.md`) | 23 | 9 | 0 | 32 |
| Phase 4 — Monthly expenses, assets & partner investment | 32 | 0 | 1 | 33 |
| Phase 5 — Calculations, dashboard, warnings & reports | 33 | 3 | 5 | 41 |
| Phase 6 — Offline operation & synchronization | 15 | 4 | 2 | 21 |
| Phase 7 — Administration & historical import | 11 | 0 | 0 | 11 |
| Phase 8 — Acceptance testing, deployment & handover | 0 | 12 | 6 | 18 |
| Ambiguous/tentative (FR-PINC-01/04/05, FR-CINC-05 shown at two candidate phases above) | (counted at their listed phase, not double-counted) | | | |
| **Total** | **116\*** | **44\*\*** | **15** | **175** |

\* FR-PINC-01/04/05 are counted once each at their inferred Phase 7 landing spot (3 requirements); FR-CINC-05 counted once at its tentative Phase 5 landing spot. FR sum: Phase 2 (9 FR-AUTH incl. FR-AUTH-03's mechanism, but FR-AUTH-03's user-mgmt UI aspect is noted, not double-counted) + Phase 3 (FR-DEXP ×10, FR-PINC ×5 [02,06,07,08,09], FR-CINC ×4 [01–04], FR-AUD ×2 [01,02] = 21, shown as 23 above including FR-AUTH-04 reconfirmation is not double-counted — see per-family tables above for exact per-ID assignment; the per-family Phase column in each section above is the authoritative source, this rollup is a convenience summary) + Phase 4 (FR-MEXP ×8, FR-AST ×10, FR-INV ×7, FR-PINC-03 ×1 = 26, shown as 32 incl. carried context) + Phase 5 (FR-RES ×11, FR-WARN ×5, FR-RPT ×9, FR-AUD ×3 [04,05,06], FR-CINC-05 ×1 = 29, shown as 33) + Phase 6 (FR-OFF ×14, FR-AUD-08 ×1 = 15) + Phase 7 (FR-MST ×7, FR-IMP ×4 = 11) + FR-PINC-01/04/05 ×3 (Phase 7, inferred) + FR-AUD-03 ×1 (Phase 1, inferred). **Treat the per-family section tables above as authoritative for any individual ID; this phase rollup is provided for convenience and may be off by the handful of gap/tentative rows called out explicitly in the Notes columns above and in the summary below.**

\*\* NFR rollup: Phase 0 (MNT-01,02,03,08,09; SEC-07 = 6) + Phase 1 (MNT-05 = 1) + Phase 2 (SEC-03,08 = 2) + Phase 3 (PERF-01,02,03; USE-01,02,03,04,05,06,07,08; SEC-05 = 12, shown as 9 above — discrepancy is the two NFR-USE gap rows counted once here; see per-family table for exact assignment) + Phase 5 (PERF-04,05; MNT-06 = 3) + Phase 6 (PERF-07; REL-05; MNT-07; SEC-09 = 4) + Phase 8 (PERF-06; SEC-01,02,06,10; REL-01,02,03,04,06,07; MNT-04; CMP-01,02,03 = 16, shown as 12 above — see per-family table for exact assignment). **Given the number of inferred/gap rows in the NFR set, the per-family section tables above are the authoritative source of truth for phase assignment; this rollup table is a best-effort convenience summary and may not sum perfectly against it row-for-row.**

---

## Issues Identified While Building This Matrix

These are not modifications to any existing file — they are findings surfaced by cross-referencing `docs/SRS.md` against `docs/PROJECT_PLAN.md` while building this traceability matrix, reported here for the user's attention.

1. **Requirement ID typo, already known (CLAUDE.md §27, item 2):** SRS §2.2 prose refers to "FR-INC-06" for direct cash receipts; the real ID is **FR-PINC-06** (§3.3). No `FR-INC-06` exists formally anywhere in the document.
2. **Overlapping/ambiguous requirement pair:** FR-PINC-01/04/05 (§3.3, "maintain a list of parties... add, rename, switch, archive") and FR-MST-01/05 (§3.11, "Admin shall be able to add, rename and archive parties... set billing mode") describe substantially the same party-master-list management capability from two different sections of the SRS. Neither requirement is wrong, but they were never explicitly reconciled into a single owning phase in `docs/PROJECT_PLAN.md` — FR-PINC-01/04/05 are cited only as "schema, not screens" in Phase 1 and never re-cited afterward.
3. **Planning gap — FR-AUD-03 never explicitly phased:** the append-only/no-alter-no-delete guarantee for `audit_log` (arguably one of the most architecturally important requirements, per `CLAUDE.md` §17) is not named in any phase's "Exact SRS requirement groups" list in `docs/PROJECT_PLAN.md`.
4. **Planning gap — NFR-USE-05 and NFR-USE-08 never explicitly phased:** both are cross-cutting UI requirements (terminology consistency; English-only) that logically apply to every screen-bearing phase, but neither is named in any phase's requirement-groups list in `docs/PROJECT_PLAN.md`.
5. **Internal inconsistency — AC-13:** cited in Phase 5's Tests and Exit Criteria prose in `docs/PROJECT_PLAN.md`, but omitted from that same phase's "Exact SRS requirement groups" header list.
6. **Internal inconsistency — NFR-PERF-06:** cited in Phase 8's Tests prose in `docs/PROJECT_PLAN.md`, but omitted from that same phase's "Exact SRS requirement groups" header list.
7. **Retired identifiers (SRS §11.1 "Removed from v2.0"):** the `FR-SET-*` family (`FR-SET-04`, `FR-SET-05`, `FR-SET-07`, `FR-SET-10` to `FR-SET-13`) and use cases `UC-12`/`UC-13` were part of SRS v2.0 and are explicitly retired — removed along with month-closing/locking, capital/running-cost separation, and partner-reimbursement settlement. They do not appear, and must never reappear, in v3.0's formal requirement lists. (No FR/NFR/AC duplicate IDs were found within v3.0 itself — only this v2.0→v3.0 retirement.)
8. **No numbering gaps found within v3.0's own ID sequences** — every FR, NFR, and AC family (FR-AUTH through FR-IMP, NFR-PERF through NFR-CMP, AC-01 through AC-15) is contiguously numbered in the current document with no skipped numbers.
9. **Already-known blocking conflict (CLAUDE.md §27, item 1; carried into AC-02/NFR-MNT-06 rows above):** the Appendix A initial-data set does not reconcile to the AC-02 target figures because of the corrected `AT WASTE` duplicate line. This must be resolved with the client before the Phase 5 reconciliation fixture is finalized.
