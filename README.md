# CDC Lab Accounts & Asset Management System

Replaces the manual Excel workbook CDC Laboratories, Gujranwala uses to
record daily income and expenses and work out the monthly profit or loss.
See `docs/SRS.md` for the full specification and `CLAUDE.md` for the
permanent development rules this project follows.

**Current status: Phase 1 (database & domain foundation) and Phase 2
(authentication & authorization) complete.** The full 13-table PostgreSQL
schema, its data-integrity constraints/triggers, the pure
`src/lib/domain` calculation functions, real Better Auth email/password
sign-in, session lockout, invitation/bootstrap account creation, and the
centralized server-side role-permission layer all exist. There is still
no transaction/reporting/investment/dashboard/offline-queue UI or API —
those are later phases, built from the Google Stitch design already
handed over (see `docs/UI_REQUIREMENTS.md`); only the Sign In screen and
its supporting auth pages exist under `src/app/`. See
`docs/adr/0002-phase-1-schema-clarifications.md` and
`docs/adr/0003-phase-2-authentication.md` for every disclosed deviation
and security decision.

## Prerequisites

- Node.js 20 or later
- npm (this project's package manager — do not use yarn/pnpm)
- PostgreSQL 16 (or later) — **required from Phase 1 onward.** Two
  databases are needed for local development: one for `DATABASE_URL`
  (development) and one whose name ends in `_test` for `TEST_DATABASE_URL`
  (integration/constraint tests — see `docs/testing.md`).

## Getting started

```bash
npm install
cp .env.example .env          # set DATABASE_URL and the Phase 2 auth/email variables below
cp .env.test.example .env.test # set TEST_DATABASE_URL to a second, disposable database
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run bootstrap:admin -- --email you@cdclabs.example  # creates the first Admin account
npm run dev
```

Then open [http://localhost:3000/sign-in](http://localhost:3000/sign-in) and
use the one-time link the bootstrap command printed to set the first
Admin's password. `GET /api/health` returns `{"status":"ok"}`.

**Phase 2 environment variables** (see `.env.example` for full detail):
`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `EMAIL_TRANSPORT` (`smtp` in
production, `file` in development — never inferred from `NODE_ENV`
alone), and `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM`
when `EMAIL_TRANSPORT=smtp`. The app refuses to start in production with
an HTTP `BETTER_AUTH_URL` or an incomplete SMTP configuration
(`docs/adr/0003-phase-2-authentication.md`).

## Available scripts

| Script                      | What it does                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`               | Start the Next.js dev server                                                                                                         |
| `npm run build`             | Production build                                                                                                                     |
| `npm run start`             | Run the production build                                                                                                             |
| `npm run typecheck`         | `tsc --noEmit` — must pass with zero errors                                                                                          |
| `npm run lint`              | ESLint                                                                                                                               |
| `npm run format`            | Prettier — write formatting fixes                                                                                                    |
| `npm run format:check`      | Prettier — check only, used in CI                                                                                                    |
| `npm test`                  | Vitest (unit + integration + constraint tests)                                                                                       |
| `npm run test:e2e`          | Playwright (end-to-end tests)                                                                                                        |
| `npx prisma validate`       | Check `prisma/schema.prisma` for correctness                                                                                         |
| `npx prisma format`         | Format `prisma/schema.prisma`                                                                                                        |
| `npx prisma generate`       | Regenerate the Prisma Client — required after any schema change                                                                      |
| `npx prisma migrate deploy` | Apply committed migrations to whichever database `DATABASE_URL` points at                                                            |
| `npx prisma db seed`        | Load Appendix A master data (see `docs/adr/0002-phase-1-schema-clarifications.md` for exactly what is and isn't seeded)              |
| `npm run bootstrap:admin`   | One-time, TTY-gated first-Admin creation — refuses to run if any user already exists (see `docs/adr/0003-phase-2-authentication.md`) |

Every one of these must pass before any change is considered complete —
see `CLAUDE.md` §5. `npm test` requires `TEST_DATABASE_URL` to be set to a
real, disposable database whose name ends in `_test` — see
`docs/testing.md`.

## Project structure

```
src/
  app/            Next.js App Router routes — (auth)/sign-in, forgot-password,
                  reset-password, accept-invitation; minimal Operator/Partner/
                  Admin placeholders; api/auth/[...all] (Better Auth), api/health
  components/
    ui/           Reusable UI primitives — empty, awaiting the Stitch design handoff
    layout/       AuthCard (Phase 2) — the rest awaits later phases
  lib/
    domain/       Pure financial calculation logic — Phase 1
    auth/         Better Auth config/invitation/lockout/audit — Phase 2
    permissions/  Centralized role/permission guard — Phase 2
    email/        Fail-closed SMTP/dev-file-sink delivery — Phase 2
    validation/   Zod schemas — Phase 1 onward
  server/         Better Auth instance, session resolution, cookie forwarding,
                  auth server actions — Phase 2
scripts/
  bootstrap-admin.ts  One-time, TTY-gated first-Admin creation — Phase 2
prisma/
  schema.prisma   13 SRS business tables + Better Auth tables, 10+ enums, all relations
  client.ts       Driver-adapter PrismaClient factory (Prisma 7 requires one)
  seed.ts         Master-data-only seed — no users, no July transaction amounts
  migrations/     Two versioned migrations — Phase 1's init, Phase 2's additive auth migration
tests/
  unit/domain/, unit/permissions/, unit/auth/    Vitest unit tests
  integration/    Vitest integration/constraint tests against real PostgreSQL
  e2e/            Playwright end-to-end tests, including the full auth flow
  fixtures/       Test fixtures, including the eventual July 2026 reconciliation fixture (Phase 5)
docs/
  SRS.md                          Authoritative requirements spec (read-only)
  PROJECT_PLAN.md                 Phase-by-phase implementation plan
  REQUIREMENTS_TRACEABILITY.md    Every requirement mapped to its phase and current status
  UI_REQUIREMENTS.md              Authoritative UI implementation guide (Stitch handoff)
  ui/screenshots/, ui/stitch-export/   The Stitch design assets
  adr/                            Architecture Decision Records
public/
  design-assets/  Placeholder for static assets exported from the Stitch design
```

## Where to look next

- `CLAUDE.md` — permanent development rules (tech stack, business rules,
  validation requirements). Read this before writing any code.
- `docs/SRS.md` — the full requirements specification. Read-only.
- `docs/PROJECT_PLAN.md` — what gets built in which phase, and why.
- `docs/REQUIREMENTS_TRACEABILITY.md` — every requirement's current status.
- `docs/adr/` — architecture decisions, including every disclosed
  deviation from the SRS's literal database design.
