# CDC Lab Accounts & Asset Management System

Replaces the manual Excel workbook CDC Laboratories, Gujranwala uses to
record daily income and expenses and work out the monthly profit or loss.
See `docs/SRS.md` for the full specification and `CLAUDE.md` for the
permanent development rules this project follows.

**Current status: Phases 0-7 and all locally achievable Phase 8A release
hardening are complete.** Transaction workflows, monthly accounts, assets,
Partner Investment, results/reports, offline sync, Administration, and
historical import are implemented. Phase 8B has not started: there is no
production deployment, hosting/backup/monitoring configuration, restore
rehearsal, client UAT, or real-device compatibility sign-off.

Six Phase 8A browser checks remain unresolved by explicit deferral: the
authenticated accessibility findings, horizontal scrolling on data screens,
and two compatibility-smoke failures. They are preserved and documented in
`docs/testing.md`. This repository is therefore **not production-ready** and
does not claim full browser validation.

## Prerequisites

- Node.js 20 or later
- npm (this project's package manager — do not use yarn/pnpm)
- PostgreSQL 16 (or later). Two
  databases are needed locally: one for `DATABASE_URL` (development) and
  one whose name ends in `_test` for `TEST_DATABASE_URL`
  (integration/constraint tests - see `docs/testing.md`).

## Getting started

```bash
npm ci
cp .env.example .env           # set the development database and auth/email values
cp .env.test.example .env.test # set TEST_DATABASE_URL to a separate test database
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run bootstrap:admin -- --email you@cdclabs.example  # creates the first Admin account
npm run dev
```

Then open [http://localhost:3000/sign-in](http://localhost:3000/sign-in) and
use the one-time link the bootstrap command printed to set the first
Admin's password. `GET /api/health` returns
`{"status":"ok","database":"ok"}` only when PostgreSQL is reachable.

**Environment variables** (see `.env.example` for full detail):
`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `EMAIL_TRANSPORT` (`smtp` in
production, `file` in development — never inferred from `NODE_ENV`
alone), and `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM`
when `EMAIL_TRANSPORT=smtp`, plus optional `LOG_STACKS`. The app refuses to
start in production with an HTTP `BETTER_AUTH_URL` or incomplete SMTP
configuration. Generate a fresh production `BETTER_AUTH_SECRET`; never use
the template placeholder.

## Available scripts

| Script                        | What it does                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                 | Start the Next.js dev server                                                                                                         |
| `npm run build`               | Production build                                                                                                                     |
| `npm run start`               | Run the production build                                                                                                             |
| `npm run typecheck`           | `tsc --noEmit` — must pass with zero errors                                                                                          |
| `npm run lint`                | ESLint                                                                                                                               |
| `npm run format`              | Prettier — write formatting fixes                                                                                                    |
| `npm run format:check`        | Prettier — check only, used in CI                                                                                                    |
| `npm test`                    | Vitest (unit + integration + constraint tests)                                                                                       |
| `npm run test:e2e`            | Playwright (end-to-end tests)                                                                                                        |
| `npm run rehearse:migrations` | Create a unique temporary database, migrate from zero, seed, verify counts, and drop only that temporary database                    |
| `npm run docs:guides`         | Regenerate the one-page Operator and Partner PDF guides                                                                              |
| `npx prisma validate`         | Check `prisma/schema.prisma` for correctness                                                                                         |
| `npx prisma format`           | Format `prisma/schema.prisma`                                                                                                        |
| `npx prisma generate`         | Regenerate the Prisma Client — required after any schema change                                                                      |
| `npx prisma migrate deploy`   | Apply committed migrations to whichever database `DATABASE_URL` points at                                                            |
| `npx prisma db seed`          | Load Appendix A master data (see `docs/adr/0002-phase-1-schema-clarifications.md` for exactly what is and isn't seeded)              |
| `npm run bootstrap:admin`     | One-time, TTY-gated first-Admin creation — refuses to run if any user already exists (see `docs/adr/0003-phase-2-authentication.md`) |

The complete validation policy is in `CLAUDE.md` §5. `npm test` requires
`TEST_DATABASE_URL` to be set to a real test database whose name ends in
`_test`; the suite truncates it between integration tests. The migration
rehearsal never resets or reuses the development or test database.

## Project structure

```
src/
  app/            Next.js App Router screens and route handlers, grouped by role
  components/
    ui/           Reusable UI primitives translated from the Stitch handoff
    layout/       Shared authenticated shell, navigation, and session controls
    entries/      Daily/monthly entry workflows and archive/history controls
    offline/      IndexedDB queue, status, conflict resolution, and sync UI
    admin/        Master data, users, profit split, and import UI
  lib/
    domain/       Pure Decimal calculation and calendar logic
    auth/         Better Auth configuration, invitation, lockout, and audit
    permissions/  Centralized role/permission guard and matrix
    validation/   Server-side Zod schemas
    offline/      Dexie queue and sync client
    security/     HTTP security-header policy
    observability/ Structured JSON logger with redaction
  server/         Session-aware actions, mutations, queries, reports, import, sync
scripts/
  bootstrap-admin.ts       One-time, TTY-gated first-Admin creation
  migration-rehearsal.ts   From-zero temporary-database rehearsal
  generate-user-guides.ts  Operator/Partner PDF guide generator
prisma/
  schema.prisma   Business, authentication, import, and sync data model
  seed.ts         Appendix A master data only - no users or financial entries
  migrations/     Seven forward-only, versioned migrations
tests/
  unit/           Domain, validation, permissions, offline, security, logging
  integration/    Real-PostgreSQL constraints, workflows, acceptance, performance
  e2e/            Preserved Playwright browser coverage and known open findings
  fixtures/       July 2026 corrected reconciliation fixture
docs/
  SRS.md                          Authoritative requirements spec (read-only)
  PROJECT_PLAN.md                 Phase-by-phase implementation plan
  REQUIREMENTS_TRACEABILITY.md    Every requirement mapped to its phase and current status
  UI_REQUIREMENTS.md              Authoritative UI implementation guide (Stitch handoff)
  deployment.md, handover.md      Phase 8A drafts with Phase 8B gaps marked
  security-review.md, testing.md  Release-hardening evidence and limitations
  user-guides/                    One-page Operator and Partner PDFs
  ui/screenshots/, ui/stitch-export/   Raw Stitch references - never edit
  adr/                            ADR-0001 through ADR-0010
```

## Where to look next

- `CLAUDE.md` — permanent development rules (tech stack, business rules,
  validation requirements). Read this before writing any code.
- `docs/SRS.md` — the full requirements specification. Read-only.
- `docs/PROJECT_PLAN.md` — what gets built in which phase, and why.
- `docs/REQUIREMENTS_TRACEABILITY.md` — every requirement's current status.
- `docs/adr/` — architecture decisions, including every disclosed
  deviation from the SRS's literal database design.
- `docs/deployment.md` and `docs/handover.md` — the production/handover
  runbooks, with every external Phase 8B value explicitly marked.
- `docs/VERCEL_SUPABASE_DEPLOYMENT.md` — beginner-oriented, click-by-click
  account setup for the chosen production host (Vercel + Supabase +
  GitHub Actions). No deployment has been performed yet.
- `Dockerfile` / `compose.yaml` — reproducible local execution and CI
  build validation only; Vercel does not run this image (see
  `docs/adr/0013-production-deployment-vercel-supabase.md`).
- `docs/security-review.md` and `docs/testing.md` — the security posture,
  validation evidence, and unresolved release gates.
