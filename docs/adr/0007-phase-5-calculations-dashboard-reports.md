# ADR-0007: Phase 5 — Calculations, Dashboard, Warnings, and Reports

## Status

Accepted. Implemented per the approved Phase 5 plan and its explicit revised decisions.

## Context

Phase 5 assembles every entry type recorded in Phases 3B/4 into the actual monthly result, the Partner Dashboard, the warnings engine, the Audit Log's user-facing screens, and PDF/Excel exports — and builds the July 2026 reconciliation fixture as the project's most important regression test. This ADR records the AT WASTE reconciliation resolution (`CLAUDE.md` §27 item 1), the Partner A/B mapping design, the profit-split rounding rule (unchanged from Phase 1), the approved variance-warning formula, the export safety discipline, the redaction discipline, and a correctness fix made during implementation.

## Decisions

### 1. The AT WASTE reconciliation — resolved by using the corrected figures, not the literal AC-02 prose

`CLAUDE.md` §27 item 1 documents that SRS Appendix A.2/A.3's literal initial data (single AT WASTE line, per SRS §11.3's own correction) sums to **Rs 1,287,459** in expenses and **Rs 208,076** profit, while AC-02/SRS §2.1's prose asks for the **uncorrected**, duplicate-AT-WASTE figures (Rs 1,295,459 expenses / Rs 200,076 profit). **Decision (approved):** build the permanent July 2026 reconciliation fixture (`tests/fixtures/july-2026-corrected.ts`, `tests/integration/fixtures/july-2026-reconciliation.test.ts`) against the **corrected** figures — Income Rs 1,495,535; Expenses Rs 1,287,459; Profit Rs 208,076; Rs 104,038 to each partner; Daily Expenses Rs 171,190; Daily-billing Party Income Rs 225,650 — since SRS §11.3 itself calls the duplicate line an error, and reproducing an admitted error as the permanent regression target would enshrine the mistake rather than the workbook's true figures. `docs/SRS.md` itself is never edited (CLAUDE.md §2) — this ADR is the disclosed record of the discrepancy and its resolution, not a silent reinterpretation.

The fixture's category amounts are taken directly from SRS Appendix A.2/A.3 (all `BUSINESS`-funded, matching the appendix, which records no partner-funded July line); the income split between counter income and monthly-billing party income has no equivalent breakdown in the SRS beyond the two headline figures the fixture reproduces, so that specific split is the fixture's own reasonable choice, not sourced from the SRS.

### 2. Explicit Partner A/B mapping — a new FK pair, never account-creation order

FR-RES-08 requires a profit split "per settings," but nothing in Phase 1's schema named _which_ user is Partner A versus Partner B for that split. An implicit rule (e.g. earliest-created Partner account) was rejected as fragile and undocumented. **Decision (approved):** `app_settings` gains `partner_a_user_id`/`partner_b_user_id`, both nullable FKs to `users`, added in one additive migration (`20260821181426_phase5_partner_mapping`) together with:

- Two `CHECK` constraints: both-configured-or-neither (`(partner_a_user_id IS NULL) = (partner_b_user_id IS NULL)`), and distinctness using `IS NULL OR IS DISTINCT FROM` (correctly permits the both-null case while still rejecting `partner_a_user_id = partner_b_user_id` once set).
- Two `reject_if_not_partner()` triggers (reusing the existing Phase 1 function) — each FK, whenever set, must reference a row with `is_partner = true`.
- `ON DELETE RESTRICT` on both FKs — a mapped partner's `users` row can never be physically deleted out from under an existing mapping (consistent with CLAUDE.md §11's delete-rejection trigger already covering `users` for the same reason).
- Deactivating a mapped partner (`is_active = false`) never clears the mapping — investment/profit-split history for a deactivated partner must remain intact, matching CLAUDE.md §11's master-data archival principle.

The mapping-setting action itself (`configurePartnerMapping`, `profit-split:configure-partners`, Admin-only) is deliberately **write-once**: it refuses a second call once both FKs are already set. Re-mapping an established split is out of scope for Phase 5 — that is Phase 7 settings-screen territory (alongside FR-MST-06's percentage editing) — so no edit path exists yet, only this narrow initial-setup action.

### 3. Profit-split rounding — unchanged from Phase 1, reconfirmed correct

`src/lib/domain/profit-split.ts`'s `splitProfit` (built in Phase 1, never modified here) already implements the approved rule exactly: Partner A's share is independently rounded `HALF_UP` to two decimals from the configured percentage; Partner B's share is the exact residual (`netResult − shareA`), never independently rounded. This guarantees the two shares always sum to exactly the net result, for a profit, a loss, zero, or a non-50/50 split — proven by the existing Phase 1 unit tests and re-exercised end-to-end through `computeMonthlyResultTotals` in Phase 5's own integration tests and the July 2026 fixture (an even-money 50/50 case, Rs 104,038 each, chosen so the fixture's expected values are exact without needing to illustrate the rounding edge case itself — that edge case is covered separately in `tests/unit/domain/profit-split.test.ts`).

### 4. Variance-warning formula (FR-WARN-04, Should)

SRS does not specify a variance threshold. **Approved formula:** `threshold = max(Rs 5,000, |previousMonthAmount| × 20%)`; a category is flagged when `|current − previous| > threshold`. A missing previous month is treated identically to a zero previous month (both yield the Rs 5,000 floor) — no special-casing. Implemented in `src/server/queries/warnings.ts`'s `listVarianceWarnings`, `Decimal` throughout.

### 5. FR-WARN-05 (per-month dismissal) — deferred, not built

FR-WARN-05 ("Should... dismissible for current month if omission is deliberate") requires persisted per-user, per-month, per-warning dismissal state — a genuinely new small data model (who dismissed what, for which month) that was not part of the approved Phase 5 scope's data model work. **Decision (approved):** defer FR-WARN-05 to a later phase; Phase 5 ships FR-WARN-01/02/03/04 only. Recorded as `Partial`/deferred in `docs/REQUIREMENTS_TRACEABILITY.md`, not silently marked done.

### 6. Trend chart — plain SVG/CSS, no charting library

CLAUDE.md §24's dependency policy (avoid a new dependency when the existing stack already covers the need) applies directly to FR-RPT-03's "show income/expenses trend across recent months." **Decision (approved):** `src/components/dashboard/TrendChart.tsx` is a hand-built accessible SVG bar chart — no `recharts`/`chart.js`/similar dependency added. Accessibility is via an SVG `<title>`/`<desc>` pair plus a visually-hidden (`sr-only`) data table carrying the same figures in text form, so the chart's information is never SVG-only. The bar height is a Decimal-driven ratio, converted to a plain rendering-coordinate number only at the point the SVG needs a literal pixel value — the same "convert only at the boundary" discipline `decimal-export.ts` uses for spreadsheet cells, though this conversion is a display coordinate, never a reused financial figure.

**Implementation note:** React's `<title>` element (including inside an SVG) requires a single string child, not an array of interpolated text/expression nodes — an initial version (`<title>{a} {b}</title>`) produced a real SSR/CSR hydration-mismatch warning in the browser console. Fixed by passing one template-string child (`{`...${x}...`}`) instead. Caught and fixed during Playwright e2e verification, not left as a latent warning.

### 7. Decimal→Excel-number export safety boundary

`src/lib/domain/decimal-export.ts`'s `toSafeExcelNumber` is the **only** place a monetary `Decimal` is ever converted to a JS `number` in the export path, and only for handing a value to ExcelJS's own numeric-cell API (a boundary requirement of that library, not a choice to compute in JS `number`). The verified six-step process: (1) confirm no more than two fractional digits, (2) confirm the scaled-cent integer is within `Number.MAX_SAFE_INTEGER`, (3) convert only here, (4) reconstruct a `Decimal` from the produced number and verify equality at two-decimal precision, (5) throw `UnsafeDecimalExportError` (never write a silently-wrong figure) if the round-trip check fails, (6) perform no further arithmetic on the converted number — it is written directly to the cell. Every monetary cell in both the PDF (`pdfkit`, via `formatMoney` — a string formatter, never a numeric conversion) and Excel (`exceljs`, via `toSafeExcelNumber`) exports goes through one of these two paths, never a raw `Number(decimalString)`.

### 8. Formula-injection protection, scoped to free-text cells only

`src/server/reports/export-safety.ts`'s `sanitizeTextCell` prefixes a leading `=`, `+`, `-`, `@`, tab, or carriage-return with `'` (Excel/Sheets/LibreOffice's own "treat as literal text" escape), applied only to free-text cells (item/category/vendor/party names, notes) — **never** to monetary cells, which are always raw signed numbers via `toSafeExcelNumber` and have no formula-injection surface at all. Verified directly: a crafted daily-expense description beginning with `=cmd|'/c calc'!A1` round-trips through a real generated workbook with the `'` prefix intact and the string content unchanged (`tests/integration/reports/monthly-summary-exports.test.ts`).

### 9. Defensive recursive audit redaction, applied at the query layer

`src/lib/audit-redaction.ts`'s `redactSensitiveValues` is applied inside `listAuditLog`/`getEntityHistory` themselves — before an audit row's `oldValues`/`newValues` ever leave the query function — rather than only at render time, which is a stronger placement: no caller of these two functions can forget to redact. Keyed on a case-insensitive **substring** match (not exact key match) against `password`, `token`, `secret`, `cookie`, `authorization`, `session`, `credential`, `hash`, recursing through nested objects and arrays. Tested directly against nested structures, case variations, and substring matches (`tests/unit/audit-redaction.test.ts`), and against a real redacted row read back from Postgres (`tests/integration/queries/audit-log.test.ts`).

### 10. Keyset (never offset) pagination for the Audit Log

`audit_log.id` is a `BigInt` autoincrement; `listAuditLog` orders `DESC` and filters `WHERE id < cursor`, returning the last row's id (serialized to a string, since `BigInt` is not JSON-serializable) as `nextCursor`. Proven index-backed and correct at any table size, unlike `OFFSET`, which degrades linearly and can skip/duplicate rows under concurrent writes between pages. The Audit Log screen exposes this as a single "Next Page →" link carrying every active filter plus the cursor forward — forward-only, matching a chronological read-log's natural use (no requirement asks for backward paging).

### 11. Exact dependency versions

`pdfkit@0.19.1`, `@types/pdfkit@0.17.6`, `exceljs@4.4.0` — installed exactly as approved, no version drift. `next.config.ts` additionally sets `serverExternalPackages: ["pdfkit"]` — discovered necessary during Playwright verification: pdfkit reads its `.afm` font-metrics files relative to its own package directory at runtime, and Next.js's default server-bundling of dependencies rewrites that path, producing `ENOENT: .../pdfkit/js/data/Helvetica.afm` in the PDF route handler. Opting `pdfkit` out of bundling (a real, documented Next.js option, not a workaround) makes the route handler `require("pdfkit")` natively, preserving its real on-disk path. Caught and fixed via an actual authenticated PDF-download Playwright test, not merely a unit test against the generator function in isolation (a mocked/unit-only test would not have caught a bundler-path issue that only manifests when Next.js's route handler actually resolves the dependency).

### 12. Correctness fix during implementation: partner-funded categories must stay visible in the Monthly Summary breakdown (BR-07/FR-RES-06)

An early version of `getItemizedExpenseBreakdown` summed only `fundingSource: 'BUSINESS'` rows per category — correct for the headline `totalExpenses` figure, but it meant a category with **only** partner-funded spending this period **never appeared at all** in the Monthly Summary breakdown, the Monthly Summary PDF, or the Excel Summary sheet's per-category lines. This directly contradicts CLAUDE.md §7 / BR-07 / FR-RES-06: "still appears in expense listings/reports by category... so spending never disappears from view." **Fixed before this phase's completion**, not deferred: `getItemizedExpenseBreakdown` now groups by `(categoryId, fundingSource)` with no funding-source filter, returning a `PARTNER`-tagged line alongside any `BUSINESS` line for the same category (never merged into one figure); the Monthly Summary page, PDF, and Excel Summary sheet all render a `"(Partner-funded — excluded from profit)"` suffix on these lines; the same treatment was extended to the "Daily Expenses (system-generated line)" figure, which previously showed only the business-funded total with no visibility into a partner-funded daily total at all. None of this changes any total feeding `netResult`/the profit split — only what is _additionally shown_ alongside those totals. Proven directly: `tests/integration/queries/results.test.ts`'s `getItemizedExpenseBreakdown` describe block asserts a partner-funded category produces its own line while `totalExpenses` still reflects only the business-funded amount.

## Consequences

- One additive Phase 5 migration ships (`20260821181426_phase5_partner_mapping`); no earlier migration was edited; no `prisma db push` was used at any point.
- FR-WARN-05 is the one Phase 5 requirement not implemented — recorded as deferred, not silently marked done.
- The July 2026 fixture reproduces the **corrected** figures, not AC-02's literal uncorrected prose — this is a disclosed, deliberate deviation from that one sentence's literal text, resolving the exact conflict CLAUDE.md §27 item 1 flagged in advance, in the direction SRS §11.3 itself points (the duplicate line is an admitted error).
- `next.config.ts` now carries one `serverExternalPackages` entry (`pdfkit`) — a narrow, documented Next.js configuration change, not a code-level workaround.
- `ItemizedCategoryLine` gained a `fundingSource` field; every consumer (Monthly Summary page, PDF, Excel) was updated in the same change, not left inconsistent.

## Related SRS Requirements

FR-RES-01 to 11, FR-WARN-01 to 04 (FR-WARN-05 deferred), FR-RPT-01 to 09, FR-AUD-04 to 06, BR-06, BR-07, BR-10, DR-07, DR-08, DR-09, NFR-PERF-04, NFR-PERF-05, NFR-PERF-06, NFR-SEC-04, AC-02 (resolved per above), AC-08, AC-09, AC-10, UC-10, UC-12, UC-13, UC-14, UC-18, UC-21.

## Approval Status

Approved by the user (all listed decisions, including the AT WASTE resolution direction, the exact dependency versions, and the efficiency/reporting constraints) before implementation began; implemented in Phase 5 per this record. The BR-07/FR-RES-06 visibility fix (§12) was a correctness fix made during implementation to satisfy an already-approved, unambiguous CLAUDE.md rule — not a new decision requiring separate approval.
