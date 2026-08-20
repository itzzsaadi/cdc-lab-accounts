# CLAUDE.md — CDC Lab Accounts & Asset Management System

Permanent development instructions for Claude Code (and any engineer) working on this repository. These rules are derived from `docs/SRS.md` v3.0 (19 August 2026) and must not be contradicted by any code, migration, or design decision made in this project.

## 1. Project Purpose

This system replaces the manual Excel workbook CDC Laboratories, Gujranwala currently uses to record daily income and expenses and work out the monthly profit or loss. The guiding principle (SRS §1.2) is: **reproduce, in software, exactly what is already done by hand — do not introduce new accounting practice.** Every calculation must match the existing workbook. Where the system adds something (e.g. direct cash receipt entries), it is to stop re-typing of figures, not to change how the business measures itself.

## 2. Authoritative Specification

`docs/SRS.md` is the single source of truth for all functional requirements, non-functional requirements, business rules, data integrity rules, database design, and acceptance criteria. It is **read-only** — never edit it as part of feature work. If a requirement appears wrong, ambiguous, or missing, raise it with the user; do not silently reinterpret or "fix" the SRS in code.

The `.docx` source and diagram images (`media/*.png`) are supporting references only; `docs/SRS.md` is authoritative for text.

## 3. Requirement ID Usage

Every functional requirement (`FR-XXX-00`), non-functional requirement (`NFR-XXX-00`), data integrity rule (`DR-00`), business rule (`BR-00`), use case (`UC-00`), and acceptance criterion (`AC-00`) has a permanent identifier per SRS §1.6. When implementing, testing, or reviewing:

- Reference the requirement ID in commit messages, PR descriptions, and code comments where a non-obvious rule is being encoded (e.g. `// BR-05: partner-funded expense excluded from profit`).
- Never reuse a retired identifier.
- If a requirement ID referenced in prose does not match any formally listed ID (see §26 "Known SRS Issues" below), treat the formally listed ID as correct and flag the discrepancy rather than guessing.

## 4. Technology Stack

- **Next.js (App Router)** — all routing and server logic
- **TypeScript, strict mode** — no implicit `any`, no `strict: false` anywhere in `tsconfig.json`
- **PostgreSQL** — the only supported database
- **Prisma** — schema, migrations, and query layer
- **Better Auth** — authentication (email/password, session management)
- **Tailwind CSS** — styling
- **Zod** — schema validation, always enforced server-side
- **Vitest** — unit and integration tests
- **Playwright** — end-to-end tests
- **Dexie** — IndexedDB wrapper for the future offline entry queue (FR-OFF-01 to 14)

Do not introduce alternative libraries that duplicate the role of any item above (e.g. a second ORM, a second validation library, a second test runner) without an ADR (§23) justifying the change.

## 5. Required Validation Commands

Before any commit is considered complete, the following must pass (add these scripts to `package.json` when the project is scaffolded, and keep them working thereafter):

```
npm run typecheck   # tsc --noEmit — build fails on type errors (NFR-MNT-08)
npm run lint         # eslint, enforced automatically (NFR-MNT-09)
npm run format:check # prettier --check
npm run test         # vitest — unit/integration tests
npm run test:e2e     # playwright — end-to-end tests
npx prisma validate  # schema correctness
npx prisma format    # schema formatting
npm run build        # production build must succeed
```

A change is not "done" until it passes all of the above, not just the ones that seem relevant.

## 6. Planned Source-Code Structure

Scaffolded in Phase 0 (directories below marked with an existing README are already in place as empty placeholders; everything else is still a plan for the phase noted).

```
/src
  /app                    Next.js App Router routes, grouped by role-visible area
    /(auth)                sign-in, password reset
    /(operator)             daily expenses, party income, counter income, cash receipts
    /(partner)               monthly expenses, assets, investment, results, reports
    /(admin)                  master lists, users, profit split settings
    /api                       route handlers (server-side auth + Zod validation on every one)
  /components
    /ui                     reusable UI primitives — translated from the Google Stitch design, not implemented from assumptions
    /layout                  structural/layout components — same rule
  /lib
    /domain                 pure calculation logic (result calc, funding-source rule, splits)
    /auth                    Better Auth config, role guards
    /validation              Zod schemas, one per entity/command
    /offline                 Dexie queue, sync client (future)
  /server                   server-only code (server actions, the Better Auth server instance, etc.)
/prisma
  schema.prisma
  /migrations
/tests
  /unit
  /integration
  /e2e
  /fixtures                 July 2026 reconciliation fixture (see §21)
/docs
  SRS.md                    (untouched)
  UI_REQUIREMENTS.md        filled in once the Stitch design handoff arrives
  /ui/screenshots, /ui/stitch-export   placeholder locations for Stitch design assets
  architecture.md
  offline-sync.md
  deployment.md
  testing.md
  /adr
/public
  /design-assets            placeholder for static assets exported from the Stitch design
```

Domain/service logic (result calculation, funding-source rule, profit split) must be isolated in `/src/lib/domain`, framework-agnostic, and unit-testable without a running Next.js server or database — this is what makes AC-02/NFR-MNT-06 practical to enforce.

## 7. Funding-Source Business Rule

Every expense (daily or monthly) carries `funding_source`: `BUSINESS` or `PARTNER` (FR-DEXP-05, FR-MEXP-05, DR-07).

- `BUSINESS` → counts toward total expenses and reduces profit (BR-02).
- `PARTNER` → excluded from profit calculation entirely (BR-05), **but still appears in expense listings/reports by category** (BR-07, FR-RES-06) so spending never disappears from view, and adds the amount to the named partner's investment total (BR-06).
- When `funding_source = PARTNER`, the partner must be named (`funded_by_user_id` required, enforced at the database level, not just the UI — DR-07).
- A partner-funded cost is **never repaid in cash**; it only raises that partner's investment total (BR-06).

This is the single most important business rule in the system. Get it wrong and profit, investment, and category reports all become inconsistent.

## 8. Asset Acquisition-Mode Rule

Every asset is either `INSTALMENT` or `CASH`, never both, never neither (FR-AST-07, DR-08):

- `INSTALMENT`: requires `monthly_instalment` (editable at any time, no end date tracked — FR-AST-05); forbids `purchased_by_user_id`. The instalment appears as a monthly expense line every month and reduces profit like any ordinary expense (FR-AST-04). **No partner is tagged** against an instalment asset (BR-09).
- `CASH`: requires `purchase_price` and `purchased_by_user_id`; forbids `monthly_instalment`. Not an expense — adds the purchase price to the purchasing partner's investment (FR-AST-06, BR-08).
- Enforce this with a database `CHECK` constraint (DR-08), not application logic alone.
- Depreciation is never calculated (FR-AST-10).

## 9. Prisma Decimal Requirement for All Money

Every money column (`amount`, `monthly_instalment`, `purchase_price`, etc.) must be `NUMERIC(14,2)` in PostgreSQL, mapped through Prisma's `Decimal` type. Never use `Float`, `Int` cents-hacks, or JavaScript `number` to represent a monetary amount anywhere in the schema, domain logic, or API payloads (DR-01).

## 10. No Floating-Point Arithmetic for Money

All monetary arithmetic (sums, splits, totals) must use `Decimal` (Prisma's `Decimal.js`-backed type or an equivalent exact-decimal library) end to end — in the database, in `/lib/domain` calculations, and when serializing to the client. Never cast a monetary value to JS `number` and perform `+`, `-`, `*`, `/` on it. This is a hard constraint (DR-01, CON-01) — the July 2026 reconciliation (§21) will not reproduce exactly under floating point.

## 11. No Physical Deletion of Financial Records

Every financial entry table carries `is_archived`. "Delete" in the UI always means archive (set `is_archived = true`), never a SQL `DELETE` on a financial record (CON-04, DR-04, BR-15). Archiving is reversible in principle and always preserves history. This applies to daily expenses, monthly expenses, party income, counter income, capital contributions, and assets. Master data (parties, items, categories, vendors) is also archived, never deleted, so historical entries referencing them remain intact (FR-MST-05, DR-06).

## 12. No Stored Profit, Loss, Shares, or Investment Totals

No table stores a calculated profit, loss, partner share, or investment running total as an editable/persisted figure (DR-09, FR-RES-11, FR-INV-01/02). These are always derived on demand from the underlying entries (`daily_expenses`, `monthly_expenses`, `party_income`, `counter_income`, `capital_contributions`, `assets`) for whatever date range is requested. Do not add a `profit_snapshot`, `investment_total` column, or any cached aggregate table — recalculate every time.

## 13. No Month Locking

There is no accounting-period/month-close concept anywhere in this system (CON-06, BR-12, SRS §11.1 — explicitly removed from v2.0 at the client's request). A "month" is a date-range filter applied at query time, defaulting to the first/last day of the current calendar month (FR-RES-01/02, BR-13) — never a stored state. Every record remains editable indefinitely. Do not add an `accounting_periods` table, a `status` field meaning "closed", or any UI/API concept of locking a month. The audit log (§17) is the only safeguard against silent alteration, precisely because nothing else prevents editing old records.

## 14. Unique `clientUuid` on Every Synchronizable Entry

Every entry table that can be created offline (`daily_expenses`, `monthly_expenses`, `party_income`, `counter_income`, and any future synchronizable entity) carries `client_uuid UUID NOT NULL UNIQUE`, generated on the device at the moment of creation, before the entry is ever sent to the server (DR-05, FR-OFF-06). This is the mechanism that makes repeated upload safe: the server ignores any `client_uuid` it has already stored, so a retried upload after a dropped connection can never create a duplicate (AC-07). Never omit this column when adding a new offline-capable entity.

## 15. Server-Side Role Authorization

Every server endpoint (API route, server action) must independently verify the caller's identity and role. **Hiding a control or route in the UI is never sufficient protection** (FR-AUTH-08, NFR-SEC-03). The three roles are `OPERATOR`, `PARTNER`, `ADMIN` (FR-AUTH-03), with `PARTNER` inheriting all `OPERATOR` capabilities and `ADMIN` inheriting all `PARTNER` capabilities (SRS §5.1). Role checks belong in the same server-side layer as the Zod validation (§18) for that endpoint — never trust a client-supplied role or a UI-only guard.

## 16. Operator Financial-Data Restrictions

An `OPERATOR` must have **no route** — through the UI or by direct API request — to profit, loss, partner investment, or the profit-split setting (FR-AUTH-04, NFR-SEC-04, AC-08). This must be enforced at the server (data withheld, not merely hidden), and reports containing profit/loss/investment must be unavailable to Operators (FR-RPT-09). When adding any new financial endpoint or report, default to Partner/Admin-only and require an explicit, reviewed reason to expose it to Operator.

## 17. Append-Only Audit-Log Rules

The `audit_log` table records every creation, change, and archiving of any financial record, plus sign-in/failed sign-in/password-change events (FR-AUD-01, FR-AUD-07). Each entry captures actor, timestamp, action, entity type/id, and before/after values (FR-AUD-02). Per FR-AUD-03 and DR-03/DR-04 spirit:

- **No UPDATE or DELETE is ever issued against `audit_log`.** The system must provide no mechanism, admin or otherwise, to alter or remove an audit entry.
- The audit log is shown as a read-only, filterable list (user, date, record type) (FR-AUD-04), and individual records show their own history (FR-AUD-05).
- For offline-created entries, record both `captured_at` (device time) and `synced_at` (server time) (FR-AUD-08, DR-02).
- Because there is no month locking (§13), this log is the only record of what changed and by whom — treat any code path that could bypass it as a critical bug.

## 18. Server-Side Zod Validation

Every write endpoint validates its input with a Zod schema on the server, regardless of any client-side validation (NFR-SEC-05). Client-side (React form) validation is a UX convenience only and must never be the sole line of defense. Reject invalid amounts (zero, negative, non-numeric) with a clear, field-level error (FR-DEXP-06) — enforced server-side first. Validation schemas live in `/lib/validation`, one per command/entity, and are the same schemas used to type API request bodies.

## 19. UTC Storage and Asia/Karachi Display

All timestamps are stored in UTC in the database (`TIMESTAMPTZ`) and displayed to users converted to Pakistan Standard Time, UTC+5, IANA zone `Asia/Karachi` (DR-02). Pakistan does not observe daylight saving, so this is a fixed +5:00 offset, but always use proper timezone-aware conversion (`Asia/Karachi`) rather than hardcoding a `+5` offset in date arithmetic, to keep the code correct and self-documenting. Every entry carries `created_by`, `captured_at`, `updated_by`, `updated_at` (DR-03).

## 20. Prisma Migration Rules

All database schema changes go through versioned Prisma migration files (`npx prisma migrate dev` / `migrate deploy`). Manual changes to the production database schema are prohibited (NFR-MNT-05). Every migration must be committed alongside the `schema.prisma` change that produced it. Never edit a migration file that has already been applied to any shared environment — create a new migration instead.

## 21. July 2026 Reconciliation Test Values

AC-02 and NFR-MNT-06 require an automated test, built early and kept passing, that reproduces the July 2026 figures exactly from a fixture of the underlying entries:

| Figure | Value |
| --- | --- |
| Total income | Rs 1,495,535 |
| Total expenses | Rs 1,295,459 |
| Net profit | Rs 200,076 |
| Partner A share (50%) | Rs 100,038 |
| Partner B share (50%) | Rs 100,038 |
| Daily expense total (component of Purchasing) | Rs 171,190 |
| Daily-billing party income total | Rs 225,650 |

This is the single most important regression test in the codebase (AC-02: "if the system does not produce Rs 200,076 from the same underlying data, something is wrong ... and it must be found before proceeding"). Build it as a Vitest fixture in `/tests/fixtures` against the `/lib/domain` result calculation as soon as that logic exists — do not defer it to end-of-project acceptance testing.

**⚠ Before building this fixture, resolve the AT WASTE discrepancy** documented in §26 below — the Appendix A initial-data set and the AC-02 target figures do not currently reconcile with each other.

## 22. Required Domain Terminology

Match the wording already used in the existing workbook throughout the UI, code, and comments (NFR-USE-05, SRS §1.4):

- **Party** (not "client" or "customer") — a referring lab/hospital. **Daily-billing party** vs **Monthly-billing party**.
- **Counter Income** — walk-in patient income, separate from party income.
- **Direct Cash Receipt** — cash received from a party outside normal billing.
- **Administration Expenses** and **Purchasing Expenses** — the two monthly expense groups, totalled together.
- **Instalment** — a fixed monthly payment toward a machine; an ordinary expense.
- **Funding Source** — Business or Partner.
- **Partner Investment** — a partner's running cumulative contribution; never affects the profit split.
- **Operator** — reception staff; cannot see financial results.
- **Archive** — marking a record inactive; never physical deletion.
- **PKR** — the only currency.

Use these exact terms in variable/entity names where practical (e.g. `counterIncome`, `partyIncome`, `fundingSource`) and always in user-facing copy.

## 23. ADR Requirements

Each significant technical decision (framework choices beyond what's fixed in §4, offline-sync conflict strategy, hosting choice, auth session design, etc.) is recorded as a short Architecture Decision Record in `/docs/adr/`, giving context, decision, and alternatives rejected (NFR-MNT-03). Number ADRs sequentially (`0001-...md`, `0002-...md`). Do not make an architecturally significant change without first writing (or updating) the corresponding ADR.

## 24. Dependency Approval Policy

CON-07 states this system will be maintained long-term by a single developer, and that simplicity and documentation take priority over performance optimisation. Accordingly:

- Do not add a new runtime dependency without first checking whether the existing stack (§4) already covers the need.
- Any new dependency must be justified in the PR description: what it does, why an existing library can't, and its maintenance burden (last release date, bundle size, license).
- Prefer well-established, actively maintained libraries over niche or unmaintained ones.
- Avoid dependencies that duplicate Prisma, Zod, Better Auth, Vitest, Playwright, or Dexie's role.
- Dev-only tooling (linters, formatters) is lower-risk but still should not sprawl beyond what's needed to satisfy §5's validation commands.

## 25. Development Workflow

1. Identify the requirement ID(s) (§3) the change implements or fixes.
2. If the change is architecturally significant, write/update an ADR first (§23).
3. Implement domain logic in `/src/lib/domain` first, with unit tests, before wiring up UI — this keeps the July 2026 fixture (§21) and the funding-source rule (§7) testable in isolation.
4. Add/extend Zod schemas (§18) for any new or changed input shape.
5. Add/extend Prisma schema + migration (§20) for any data model change; never hand-edit the database.
6. Enforce role checks server-side (§15/§16) for any new endpoint.
7. Run the full validation suite (§5) before committing.
8. Keep `CHANGELOG.md` and, where relevant, `/docs` documentation deliverables (architecture, offline-sync, deployment, testing) up to date as part of the same change, not as an afterthought.
9. Never implement a feature explicitly out of scope (§26) without an approved Change Request per SRS §12.

## 26. Out-of-Scope Features

Per SRS §1.3 and §11.1, the following are explicitly **not** part of this system and must not be implemented without a client-approved Change Request:

- Payroll processing, bank integration, and payment gateways
- Patient registration and diagnostic test results
- Tax filing and integration with accounting packages
- Asset depreciation (FR-AST-10)
- Instalment end dates and outstanding/remaining balances (FR-AST-05)
- **Month closing and locking** — explicitly declined by the client; do not build an accounting-period/close concept (§13)
- **Separation of capital from running costs** — declined; instalments always count as ordinary expenses (BR-04)
- **Partner reimbursement / settlement transfers** — declined; partner-funded costs raise investment only, are never repaid (BR-06)
- Multiple currencies, multiple branches, native mobile applications
- Urdu interface (English only per NFR-USE-08)

These were considered and set aside for this release (SRS §12); some may return as future Change Requests but are not to be pre-built "just in case."

---

## 27. Known SRS Issues (flag, do not silently resolve)

Two inconsistencies were found while reading `docs/SRS.md` v3.0. Do not "fix" either by guessing — raise with the user/client before the affected work begins.

1. **July 2026 reconciliation figures vs. Appendix A initial data do not reconcile.** SRS §11.3 states the duplicate `AT WASTE` line (Rs 8,000) in the original July 2026 workbook was an error and "is one fixed monthly bill, not two." Appendix A.2 lists `AT WASTE` once, and the 15 administration categories in Appendix A.2 sum to Rs 692,919; combined with the 10 purchasing lines in Appendix A.3 (Rs 594,540), total expenses = **Rs 1,287,459**. But AC-02 and SRS §2.1 both require the system to reproduce total expenses of **Rs 1,295,459** and profit of **Rs 200,076** (which is exactly Rs 1,495,535 − Rs 1,295,459, i.e. the *uncorrected*, duplicate-AT-WASTE figure). If Appendix A's initial data is loaded as literally specified, the system will compute profit of Rs 208,076 (Rs 104,038 per partner), not the Rs 200,076 / Rs 100,038 required by AC-02. **This must be resolved with the client** — either the AC-02 target figures need updating, or Appendix A.2 needs an explicit extra Rs 8,000 administration line (or the reconciliation fixture in §21 needs its own dataset distinct from the literal Appendix A seed data) — before the AC-02/NFR-MNT-06 automated test is written.

2. **Requirement ID typo in SRS §2.2.** The narrative text says "Requirement FR-INC-06 gives those receipts a place to live," but no `FR-INC-06` exists anywhere else in the document. The actual requirement for direct cash receipts is **FR-PINC-06** (SRS §3.3). Treat `FR-PINC-06` as correct; `FR-INC-06` is a documentation typo.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
