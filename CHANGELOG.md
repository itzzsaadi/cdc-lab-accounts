# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — Phase 2: Authentication and Authorization

- Better Auth integration (`src/lib/auth/config.ts`, `src/server/auth.ts`):
  the Prisma adapter (`@better-auth/prisma-adapter`), email/password
  sign-in with public self-registration disabled, 30-day sessions
  (FR-AUTH-05), 60-minute single-use password-reset tokens (FR-AUTH-06,
  stored hashed via `verification.storeIdentifier: "hashed"`), and no
  admin plugin (hand-built invitation/bootstrap/session-revocation
  instead, to avoid a duplicate `banned`/`is_active` deactivation
  mechanism).
- `prisma/migrations/20260820181038_phase2_auth/`: additive migration
  adding Better Auth's `sessions`/`account`/`verification` tables and five
  new `users` columns (`email_verified`, `image`, `updated_at`,
  `failed_login_count`, `lockout_until`) — the Phase 1 migration is
  untouched.
- `src/lib/auth/invitation.ts`: a two-layer invitation-acceptance
  mechanism — a project-owned, SHA-256-hashed "gate" token (plain Prisma
  rows, never Better Auth's internal adapter) wraps Better Auth's own
  public `requestPasswordReset`/`resetPassword` endpoints for the actual
  credential creation. The gate token is consumed only after credential
  creation fully succeeds (one `prisma.$transaction` with a
  `pg_advisory_xact_lock`), so a transient failure never permanently burns
  a legitimate invitation.
- `src/lib/auth/lockout.ts`: FR-AUTH-07's 10-failure/15-minute account
  lockout via one atomic `UPDATE ... RETURNING`, with a sign-in sequence
  that guarantees a locked or deactivated account's session is deleted
  before any `Set-Cookie` header is ever forwarded to the browser.
- `src/lib/permissions/`: the centralized `requirePermission`
  authorization layer (`roles.ts`, `matrix.ts`, `guard.ts`), called
  identically from every Server Component, Server Action, and Route
  Handler.
- `src/lib/email/`: fail-closed email delivery — SMTP/Nodemailer in
  production (refuses to start with incomplete configuration), a
  git-ignored local file sink in development/test (refuses to run when
  `NODE_ENV=production` regardless of configuration).
- `scripts/bootstrap-admin.ts`: a one-time, TTY-gated first-Admin
  bootstrap command — refuses to run if any `users` row already exists,
  never logs or emails its one-time setup link.
- Sign In screen (`src/app/(auth)/sign-in`) reproducing the approved
  Stitch design as real React components, plus forgot-password,
  reset-password, and accept-invitation pages, and minimal
  Operator/Partner/Admin placeholder routes proving role protection.
- `@better-auth/prisma-adapter@1.7.1`, `nodemailer@9.0.5`,
  `@types/nodemailer@8.0.1` added as exact-pinned dependencies.
- Two new `AuditAction` values: `SESSION_REVOKED`, `ACCOUNT_LOCKED`.
- `docs/adr/0003-phase-2-authentication.md`, recording the full Better
  Auth integration design and every disclosed security decision.

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
