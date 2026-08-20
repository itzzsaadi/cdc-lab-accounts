# CDC Lab Accounts & Asset Management System

Replaces the manual Excel workbook CDC Laboratories, Gujranwala uses to
record daily income and expenses and work out the monthly profit or loss.
See `docs/SRS.md` for the full specification and `CLAUDE.md` for the
permanent development rules this project follows.

**Current status: Phase 1 (database & domain foundation) complete.** The
full 13-table PostgreSQL schema, its data-integrity constraints/triggers,
and the pure `src/lib/domain` calculation functions exist. There is still
no authentication, no API routes, and no UI — the real UI will be built
from the Google Stitch design already handed over (see
`docs/UI_REQUIREMENTS.md`); nothing in `src/components/` is implemented
yet. See `docs/adr/0002-phase-1-schema-clarifications.md` for every place
this schema deliberately deviates from `docs/SRS.md` §6's literal text.

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
cp .env.example .env          # set DATABASE_URL to your local Postgres
cp .env.test.example .env.test # set TEST_DATABASE_URL to a second, disposable database
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) — you should see a
plain placeholder page confirming the app is running. `GET /api/health`
returns `{"status":"ok"}`.

## Available scripts

| Script                      | What it does                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`               | Start the Next.js dev server                                                                                            |
| `npm run build`             | Production build                                                                                                        |
| `npm run start`             | Run the production build                                                                                                |
| `npm run typecheck`         | `tsc --noEmit` — must pass with zero errors                                                                             |
| `npm run lint`              | ESLint                                                                                                                  |
| `npm run format`            | Prettier — write formatting fixes                                                                                       |
| `npm run format:check`      | Prettier — check only, used in CI                                                                                       |
| `npm test`                  | Vitest (unit + integration + constraint tests)                                                                          |
| `npm run test:e2e`          | Playwright (end-to-end tests)                                                                                           |
| `npx prisma validate`       | Check `prisma/schema.prisma` for correctness                                                                            |
| `npx prisma format`         | Format `prisma/schema.prisma`                                                                                           |
| `npx prisma generate`       | Regenerate the Prisma Client — required after any schema change                                                         |
| `npx prisma migrate deploy` | Apply committed migrations to whichever database `DATABASE_URL` points at                                               |
| `npx prisma db seed`        | Load Appendix A master data (see `docs/adr/0002-phase-1-schema-clarifications.md` for exactly what is and isn't seeded) |

Every one of these must pass before any change is considered complete —
see `CLAUDE.md` §5. `npm test` requires `TEST_DATABASE_URL` to be set to a
real, disposable database whose name ends in `_test` — see
`docs/testing.md`.

## Project structure

```
src/
  app/            Next.js App Router routes (currently just the placeholder health page + /api/health)
  components/
    ui/           Reusable UI primitives — empty, awaiting the Stitch design handoff
    layout/       Structural/layout components — empty, awaiting the Stitch design handoff
  lib/
    domain/       Pure financial calculation logic — implemented Phase 1
    auth/         Better Auth configuration — Phase 2
    validation/   Zod schemas — Phase 1 onward
  server/         Server-only code (server actions, etc.) — Phase 2 onward
prisma/
  schema.prisma   13 SRS business tables, 10 enums, all relations (Phase 1)
  client.ts       Driver-adapter PrismaClient factory (Prisma 7 requires one)
  seed.ts         Master-data-only seed — no users, no July transaction amounts
  migrations/     One versioned migration so far, hand-edited for CHECKs/triggers
tests/
  unit/domain/    Vitest unit tests for src/lib/domain
  integration/    Vitest integration/constraint tests against real PostgreSQL
  e2e/            Playwright end-to-end tests
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
