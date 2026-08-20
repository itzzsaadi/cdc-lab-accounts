# Changelog

All notable changes to this project are documented here.

## [Unreleased]

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
