# ADR-0009: Phase 7 — Administration Area and Historical Import

## Status

Accepted.

## Context

Phase 7 delivers the Administration Area (master-data CRUD, user role/partner-flag
management, profit-split percentage editing) and the historical-data-import
pipeline (FR-IMP-01 to 04) that FR-MST-07's "system delivered pre-loaded with
July 2026 data" ultimately depends on. A full draft plan was reviewed and
returned with six mandatory corrections before implementation began — this
ADR records the design actually built to satisfy each one, plus the smaller
decisions made along the way, per `CLAUDE.md` §23/NFR-MNT-03.

## Decisions

### 1. Import-session claim is a standalone statement, not a step inside the business transaction

The original draft deleted `ImportSession` from inside the same
`prisma.$transaction` that writes the imported business rows — if that
transaction later rolled back (a mid-import failure), the delete would roll
back with it, silently making the session reusable again. **Fixed**: the
claim is a single, already-committed `updateMany` (`WHERE id = ? AND status =
'PENDING' AND expiresAt > now()`, setting `status = 'CLAIMED'`), issued
_before_ the business transaction ever opens (`src/server/import/commit.ts`).
Its `count` result (0 or 1) is the sole source of truth for "did this request
win the claim" — a concurrent or retried commit against the same session
always sees `count !== 1` and is rejected outright, regardless of what
happens afterward. Proven under real concurrency in
`tests/integration/import/import-pipeline.test.ts` (`Promise.all` of two
`commitImport` calls against the same session — exactly one succeeds, and
the business table never ends up with duplicate rows).

### 2. `ImportBatch` (durable) vs. `ImportSession` (ephemeral) — two tables, not one

`ImportBatch` is created at preview time (`status: PENDING`) and is the
durable, permanent import history: file hash, actor, timestamps, status,
row counts, and a JSON result summary — physically delete-protected via the
same `reject_physical_delete()` trigger every other business/audit table
uses. `ImportSession` holds the actual workbook bytes and a 15-minute
`expiresAt`; it is _not_ delete-protected (ephemeral upload infrastructure,
same category as `sessions`/`account`/`verification`/`sync_operations`).
Repeated-file detection queries `ImportBatch.fileHash` + `status =
'COMMITTED'` — never audit-log JSON, which was never designed as an index
and would have made "was this exact file already imported" an unbounded
scan. Workbook bytes are nulled on every terminal path: a successful commit
deletes the whole `ImportSession` row outright; a failed commit nulls
`fileBytes` and marks the session `FAILED`; an unclaimed session past its
`expiresAt` is swept (nulled, marked `EXPIRED`) opportunistically at the top
of every `previewImport` call — the same "no dedicated cron, checked
inline" pattern Phase 6's `sync_operations` retention already established
(CON-07).

### 3. Commit always reparses the claimed session's own stored bytes from scratch

`commitImport` never trusts anything the browser echoes back from its
preview response — only the opaque `importSessionId`. It re-reads
`fileBytes` from the now-claimed `ImportSession` row, rebuilds
`MasterDataResolvers` fresh (a live query, so a party archived or renamed
between preview and commit is picked up), and reruns the _entire_ parse/
validate pipeline. If that reparse finds any issue, the whole commit is
rejected — proven directly by a test that archives an expense item _after_
a clean preview and _before_ commit: the commit fails cleanly, zero
`daily_expenses` rows are written, and both the session and batch are
marked `FAILED`. This is what makes FR-IMP-03 ("no partial import") true
under a real race, not just at the instant of preview.

### 4. Master-data name uniqueness: a functional index, not a plain `@unique`

Party/expense-item/expense-category/vendor names are trimmed before saving
(`lib/validation/master-data.ts`) and made case/whitespace-insensitively
unique via `CREATE UNIQUE INDEX ... ON <table> ((lower(btrim(name))))`,
replacing the Phase 1 plain unique index. A migration preflight (`DO $$
... RAISE EXCEPTION ...`) fails the migration clearly, listing every
offending normalized duplicate, if pre-existing data would violate the new
index — never lets `CREATE UNIQUE INDEX` itself fail with an opaque
constraint error. Archiving a row does not free its name for reuse (the
index covers active and archived rows alike, matching FR-MST-05's
historical-integrity spirit) — proven directly in
`tests/integration/constraints/master-data-normalization.test.ts`.
Application code still runs a friendly pre-check
(`findByNormalizedName` in `server/mutations/master-data.ts`) so a duplicate
usually surfaces as a clear message rather than a raw `P2002` — but the
database index, not that pre-check, is what actually prevents a race
between two concurrent requests from both passing the pre-check.

### 5. Profit split: JSON → typed `Decimal` columns, backfilled and CHECK-enforced

`app_settings.setting_value` (a JSONB blob holding `{partner_a, partner_b}`)
is replaced as the source of truth by two new `DECIMAL(5,2)` columns,
`split_a_percent`/`split_b_percent`. The migration backfills them from the
legacy JSON, preflight-checks the backfilled result (non-null, in
`[0,100]`, summing to exactly 100) with the same
fail-clearly-before-altering pattern as decision 4, then adds
`app_settings_profit_split_valid` — a `CHECK` that only constrains the row
where `setting_key = 'profit_split'`, leaving every other settings row
unaffected. `updateProfitSplit` (`server/mutations/app-settings.ts`)
recomputes the sum itself via `Decimal` (never a native `number`) before
ever reaching the database, and never touches
`partnerAUserId`/`partnerBUserId` — that mapping stays exactly as the
Phase 5 `configurePartnerMapping` write-once action set it, per the
approved "keep Partner A/B identity fixed, no remapping in Phase 7"
decision. `ProfitSplitForm` discloses plainly, in the UI itself, that a
change here affects every period's _live_ calculation immediately —
including months already reported — since no period ever had a stored
result to begin with (DR-09); this is never described as a "future periods
only" change, because there is no such thing in this system.

### 6. User administration: one trigger for both deactivation and role downgrade, concurrency-safe via row locking

The last-active-Admin protection required by the mandatory corrections
covers _both_ "deactivate the last Admin" and "demote the last Admin's role
away from ADMIN" in a single `BEFORE UPDATE` trigger
(`reject_unsafe_admin_change`), not two separate checks. It is
concurrency-safe via `SELECT ... FOR UPDATE` over every _other_ active Admin
row before counting them — a genuinely concurrent attempt to demote two
different Admins at the same moment either serializes behind that lock or
is caught by Postgres's own deadlock detector (one transaction aborts and
can be retried against consistent state), rather than a
count-then-update race where both transactions could independently observe
a safe count and both commit an unsafe result. A second trigger
(`reject_partner_flag_removal_if_mapped`) blocks removing partner status
from a user currently configured as Partner A or B. A third, `AFTER UPDATE`
trigger (`revoke_sessions_on_authorization_change`) deletes every session
row for a user whose `role`, `is_partner`, or `is_active` changed, from
_any_ code path that issues the `UPDATE` — not only the Server Actions this
phase adds — and is effective immediately because `session.cookieCache`
stays disabled (every request re-validates against the `sessions` table).
Application code (`server/mutations/user-admin.ts`,
`server/actions/auth.ts`) adds its own self-service guards on top (an Admin
cannot demote their own role or remove their own partner flag, and
deactivation/reactivation run inside a transaction with an explicit
`session.deleteMany`) — a second, independent layer, not a replacement for
the database triggers, since only the request context knows _who_ is
asking.

### 7. Import security: reparse from raw bytes, reject rather than coerce

`src/lib/domain/import-cells.ts` is the one place an exceljs cell value
becomes a plain string: a formula-shaped cell (`{formula, result}`), a
numeric cell, a `Date` object, or rich text are all rejected outright,
never silently coerced via `.toString()`. This is why the approved Excel
template requires Text-formatted date/month/amount columns — the parser
never has to guess at Excel's own numeric-date or floating-point-amount
representation, both of which this project avoids everywhere else
(DR-01/DR-02/CON-01). A magic-byte check
(`assertValidWorkbookSignature`, `PK\x03\x04` / OLE2 header) runs before
exceljs ever touches the bytes, rejecting a renamed non-Excel file cleanly.
Server-owned UUIDs are generated for every imported row (`randomUUID()`,
never trusting anything from the workbook); Asia/Karachi date semantics are
preserved via a new `noonKarachiUtcForDate` helper (a fixed +5:00/07:00 UTC
offset is provably correct for an _already-known_ calendar date, unlike
`todayInKarachi`, which reads live "now" and must never hardcode an
offset). Uploaded bytes are never written to disk, public storage, or any
log — they exist only as `ImportSession.fileBytes` (`BYTEA`), nulled on
every terminal path per decision 2.

### 8. A real UI bug found writing the Playwright suite: singularizing "Parties" and "Categories"

`MasterDataManager`'s "Add {entity}" button originally derived its singular
form via `entityLabel.replace(/s$/, "")` — correct for "Expense Items" →
"Expense Item" and "Vendors" → "Vendor", but wrong for "Parties" → "Partie"
and "Expense Categories" → "Expense Categorie" (stripping a trailing "s"
does not undo an "-ies" plural). This was caught by
`tests/e2e/phase7-administration.spec.ts`'s Party-creation test timing out
waiting for a button whose actual accessible name was "Add Partie", not
"Add Party". **Fixed** by adding an explicit `itemLabel` prop to
`MasterDataManager`, supplied by each of the four entity managers
(`"Party"`, `"Expense Item"`, `"Expense Category"`, `"Vendor"`) rather than
derived by regex — the same fix used for both the button and the create
modal's title.

### 9. Administration Area reached via an in-page tab bar, not new sidebar links

The six new routes (`/parties`, `/expense-items`, `/expense-categories`,
`/vendors`, `/profit-split`, `/import`) are deliberately _not_ added as new
`Sidebar` navigation entries — `AdministrationTabs` renders an in-page tab
bar shared across all six pages instead. This avoids touching
`tests/e2e/shell.spec.ts`'s existing hard-coded per-role nav-item-count
assertions (a Phase 3A/6 precedent this phase did not need to reopen), and
is not a security decision either way — every route's real, independent
guard is its own server-side `requirePermission("...")` call at the top of
the page, proven directly (not via navigation visibility) in
`tests/integration/authorization/phase7-authorization-sweep.test.ts` and
`tests/e2e/phase7-administration.spec.ts`'s route-protection sweep.

### 10. No new dependency

`exceljs` (already a Phase 5 dependency, used there for report _writing_)
is reused for import _reading_ — `workbook.xlsx.load(bytes)`. No new
runtime or dev dependency was installed for Phase 7, per the approved "no
new dependencies" decision. One documented `as any` cast is used at the
single call site where exceljs's own bundled `Buffer` type ambiently
conflicts with this project's `@types/node` `Buffer<ArrayBufferLike>` — a
type-declaration mismatch between two independently-typed packages, not a
real runtime concern, and confirmed the project's ESLint config does not
flag `no-explicit-any`.

## Consequences

- Six new Admin-only routes and two new API routes, all independently
  guarded server-side.
- One new migration (`phase7_administration_and_import`) adding
  `ImportBatch`/`ImportSession` tables, `updated_at`/`updated_by` to four
  master-data tables, `split_a_percent`/`split_b_percent` to
  `app_settings`, four functional unique indexes, three new `users`
  triggers, and one new delete-rejection trigger — reviewed in full before
  being committed, per `CLAUDE.md` §20.
- `app_settings.setting_value`'s `partner_a`/`partner_b` JSON keys are no
  longer read or written by any Phase 7 code path; `getProfitSplitConfig`
  reads the typed Decimal columns exclusively. The JSON column itself is
  left in place (still used for other setting keys) rather than dropped.
- Assets are explicitly out of scope for the historical-import pipeline —
  no FR-IMP wording requires it, and the approved Phase 7 decision was to
  not expand scope by inference.
- No self-service or Admin editing of a user's full name was added — also
  an approved out-of-scope decision for this phase.

## Alternatives rejected

- **Deleting `ImportSession` inside the business transaction** — rejected;
  cannot survive a rollback (the original flaw this ADR's decision 1
  fixes).
- **A single `ImportSession`-only design with no separate `ImportBatch`** —
  rejected; conflates "durable audit-trail history" with "ephemeral
  in-flight upload state," and would force repeated-file detection to scan
  bytes/JSON rather than an indexed hash + status.
- **Count-then-update for last-Admin protection** — rejected; a plain
  `SELECT count(*)` followed by an `UPDATE` in application code is a
  textbook TOCTOU race under two genuinely concurrent requests; the
  `SELECT ... FOR UPDATE` row-locked trigger closes that window at the
  database level.
- **A generic "master data" CRUD action parameterized by table name** —
  rejected in favor of one exported function per entity/verb
  (`createParty`, `createExpenseItem`, ...) sharing only an internal
  duplicate-name helper — keeps each entity's Zod schema, permission key,
  and audit `entityType` explicit and grep-able, rather than a
  stringly-typed dispatch table.
