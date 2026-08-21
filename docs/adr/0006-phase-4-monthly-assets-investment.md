# ADR-0006: Phase 4 — Monthly Expenses, Assets, and Partner Investment

## Status

Accepted. Implemented per the approved Phase 4 plan (5 decisions approved by the user before implementation began).

## Context

Phase 4 builds the Partner-only, monthly-cadence workflows: Administration/Purchasing monthly expenses, the monthly-billing party bill (FR-PINC-03), the asset register with its strict Cash/Instalment rule, capital contributions and drawings, and the partner investment statement. This ADR records the five approved decisions and the implementation choices made while carrying them out.

## Decisions

### 1. `assets.default_category_id`

FR-AST-02's literal field list (name, classification, acquisition mode, vendor, date) does not mention a category, but `monthly_expenses.category_id` is `NOT NULL` and FR-AST-04 requires the _system itself_ to create each month's instalment line — there was no data-driven source for that column's value. **Decision (approved):** add `assets.default_category_id`, a nullable FK to `expense_categories`, required only for `INSTALMENT`-mode assets. The Phase 1 `assets_acquisition_mode_check` CHECK was extended (dropped and re-added, same migration) so `INSTALMENT` additionally requires `default_category_id IS NOT NULL` and `CASH` requires it `IS NULL` — mirroring the existing `monthly_instalment`/`purchase_price`/`purchased_by_user_id` exclusivity exactly. "Active and belongs to Purchasing" is validated in application code (`src/server/mutations/assets.ts`'s `validateInstalmentCategory`), not a new database trigger — reserving a new generic trigger for this single cross-table check would duplicate the existing FK/`is_active` pattern rather than add a genuinely new safeguard, and it mirrors how an archived `expense_item` is already kept out of new Daily Expense selections (query-time filtering, not a trigger).

### 2. `party_income_active_monthly_party_month_unique`

FR-PINC-03 requires exactly "one figure per party per month." **Decision (approved):** a partial unique index on `party_income` (`party_id`, `income_date`) `WHERE receipt_type = 'MONTHLY' AND is_archived = false`, mirroring Phase 3B's `party_income_active_daily_cell_unique` exactly — archive-then-correct history is preserved, only one _live_ row is enforced. A `DO` block preflight runs before the index is created, counting any party/month pair that already has more than one active `MONTHLY` row and raising an exception rather than archiving or altering anything automatically; since no application code wrote `MONTHLY` rows before Phase 4, this preflight was a no-op in practice, but it is a permanent safeguard against ever re-running this migration against data that has since drifted.

Both changes are hand-edited into one additive migration, `20260821170513_phase4_monthly_assets_investment`, per the documented Prisma escape-hatch pattern (CLAUDE.md §20). No earlier migration was touched.

### 3. Instalment generation is Partner-triggered, previewed, explicitly confirmed

**Decision (approved):** there is no background job or silent auto-generation. A Partner viewing Monthly Expenses for a selected `periodMonth` (default current month, but any month may be targeted, including a past one — nothing auto-backfills a missed month) clicks "Generate Instalment Lines," sees a preview of every `ACTIVE` instalment asset lacking a live line for that month, and confirms before anything is created. This is consistent with Phase 5's planned FR-WARN-02 ("list active instalment assets missing this month's expense line"), which presupposes a line can legitimately be missing — a silent background generator would make that warning meaningless.

**Algorithm, exactly as implemented** (`src/server/mutations/monthly-expenses.ts`):

1. Candidates = `ACTIVE` + `INSTALMENT` assets with no live row in the partial unique index (`asset_id`, `period_month`, `is_archived = false`) for the selected month.
2. One `monthly_expenses` create **per asset, each in its own `prisma.$transaction`**, paired with its own `appendBusinessAudit` row — never one shared transaction. A single constraint violation aborts every subsequent statement in a shared Postgres transaction with no cheap per-statement savepoint available through Prisma's interactive-transaction API; per-asset transactions match CON-07's simplicity mandate and the actual concurrency size this system has (a Partner clicking a button, not a high-frequency writer).
3. Concurrency: two simultaneous "Generate" calls racing on the same asset — the second's per-row transaction hits the partial unique index, is caught as a P2002 via the existing `isUniqueConstraintViolationOn` helper, and is treated as "already generated," never an error — the same idiom Phase 3B already established for `client_uuid` replay safety. Proven directly by a `Promise.all` concurrency test (`tests/integration/mutations/monthly-expenses.test.ts`): exactly one row and one audit event survive.
4. `client_uuid` on a generated row is operation-generated (`randomUUID()`), not browser-supplied — there is no browser step in this action, only a Partner's confirm click. `monthly_expenses.client_uuid` supports either origin equally; DR-05 requires uniqueness, not a specific origin.
5. Correction: editing `assets.monthlyInstalment` affects only instalment rows **not yet generated** (future months). An already-generated month's row is corrected via the ordinary FR-MEXP-07 stale-write-protected edit, never auto-regenerated or bulk-altered — proven by a dedicated test asserting an August-generated row keeps its original amount after the asset's instalment is changed and September is generated at the new amount.
6. No rounding logic applies anywhere in this flow: FR-AST-05 explicitly excludes any total-price/end-date/outstanding-balance concept, so there is no "final instalment" in this system — the amount is a fixed exact `Decimal` copied unchanged every month.

The identical batch-preview-confirm-per-row-transaction shape is reused for FR-MEXP-06's recurring-line pre-fill (`applyRecurringPrefill`), server-re-deriving the candidate set at confirm time rather than trusting the client's submitted line list verbatim.

### 4. Monthly Party Bill gets its own route and permission

**Decision (approved):** FR-PINC-03 (Partner-only, UC-07) is a new route, `src/app/(app)/(partner)/party-income-monthly`, gated by a new permission key `party-income:monthly-bill` (`minimumRole: "PARTNER"`), rather than folded into the Operator-facing Party Income grid (`entry:party-income`, `minimumRole: "OPERATOR"`). No Stitch screen exists for this workflow (it is not one of the 11 handoff screens) — the page was built from the SRS text and the existing design-token components (`Table`, `EmptyState`, `Button`), not guessed visually.

`FR-PINC-07` (previously `Partial`, deferred pending this exact feature) is completed here: `src/server/queries/party-income.ts`'s new `getPartyMonthlyTotals` combines daily entries, the monthly bill figure, and cash receipts per party — whichever components apply to that party's billing mode — closing the three-way total FR-PINC-07 describes. **`FR-PINC-08` remains `Partial`**: its per-party/combined totals are shown correctly, but only for a whole calendar month — the requirement's literal text ("for any range") also asks for an arbitrary custom date range, which no screen offers yet; that is deferred, most likely to Phase 5's date-range work.

### 5. No Partner Dashboard or FR-RPT/FR-RES/FR-WARN functionality

**Decision (approved):** Phase 4 adds only real navigation entries (Monthly Expenses, Monthly Party Bills, Asset Register, Partner Investment) to the Partner section of `src/lib/navigation/nav-items.ts` — no dashboard page, no report, no warnings engine. `docs/PROJECT_PLAN.md`'s existing Phase 4 boundary ("No results/profit-and-loss calculation screens or dashboard (Phase 5)") controls; the placeholder `(partner)/dashboard/page.tsx` built in Phase 2 is untouched.

## Consequences

- Two additive schema changes ship in one migration; no earlier migration was edited; no `prisma db push` was used at any point.
- `assets.default_category_id`'s "active + Purchasing group" rule is enforced in application code, not a database trigger — a future direct SQL insert bypassing the application layer could violate it; this is an accepted, disclosed trade-off (CON-07), consistent with how master-data active/archived filtering is already enforced everywhere else in this codebase.
- Capital contributions and assets (both lacking `client_uuid` per ADR-0002 decision 7) rely on their forms' submit-button-disable-while-pending behavior against a double click, not a replay-safe idempotency key — an accepted, disclosed trade-off matching the existing ADR-0002 precedent for these two tables specifically.
- FR-PINC-07 is now `Implemented` in `docs/REQUIREMENTS_TRACEABILITY.md`; FR-PINC-08 stays `Partial` (custom date range still missing) and FR-MEXP-02 stays `Partial` (Admin category CRUD is Phase 7's FR-MST-03) — no other Phase 5 requirement (FR-RES/FR-WARN/FR-RPT) was touched.

## Related SRS Requirements

FR-MEXP-01 to 08, FR-PINC-03, FR-PINC-07/08, FR-AST-01 to 10, FR-INV-01 to 07, DR-08, DR-09, BR-06, BR-08, BR-09, BR-11, AC-05, UC-06 to UC-09, UC-11.

## Approval Status

Approved by the user as the five listed decisions before implementation began; implemented in Phase 4 per this record.
