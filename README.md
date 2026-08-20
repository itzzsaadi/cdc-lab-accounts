# CDC Lab Accounts & Asset Management System

Replaces the manual Excel workbook CDC Laboratories, Gujranwala uses to
record daily income and expenses and work out the monthly profit or loss.
See `docs/SRS.md` for the full specification and `CLAUDE.md` for the
permanent development rules this project follows.

**Current status: Phase 0 (repository & development foundation) only.**
There is no business logic, authentication, or database schema yet — just
the tooling scaffold and a placeholder health page. The real UI will be
built from a Google Stitch design once it is handed over (see
`docs/UI_REQUIREMENTS.md`); nothing in `src/components/` is implemented yet.

## Prerequisites

- Node.js 20 or later
- npm (this project's package manager — do not use yarn/pnpm)
- PostgreSQL — **not required yet.** Nothing in Phase 0 connects to a live
  database; a real instance is only needed starting Phase 1.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) — you should see a
plain placeholder page confirming the app is running. `GET /api/health`
returns `{"status":"ok"}`.

## Available scripts

| Script                 | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start the Next.js dev server                 |
| `npm run build`        | Production build                             |
| `npm run start`        | Run the production build                     |
| `npm run typecheck`    | `tsc --noEmit` — must pass with zero errors  |
| `npm run lint`         | ESLint                                       |
| `npm run format`       | Prettier — write formatting fixes            |
| `npm run format:check` | Prettier — check only, used in CI            |
| `npm test`             | Vitest (unit/integration tests)              |
| `npm run test:e2e`     | Playwright (end-to-end tests)                |
| `npx prisma validate`  | Check `prisma/schema.prisma` for correctness |
| `npx prisma format`    | Format `prisma/schema.prisma`                |

Every one of these must pass before any change is considered complete —
see `CLAUDE.md` §5.

## Project structure

```
src/
  app/            Next.js App Router routes (currently just the placeholder health page + /api/health)
  components/
    ui/           Reusable UI primitives — empty, awaiting the Stitch design handoff
    layout/       Structural/layout components — empty, awaiting the Stitch design handoff
  lib/
    domain/       Pure financial calculation logic — Phase 1
    auth/         Better Auth configuration — Phase 2
    validation/   Zod schemas — Phase 1 onward
  server/         Server-only code (server actions, etc.) — Phase 2 onward
prisma/
  schema.prisma   Generator + datasource only — no models yet (Phase 1)
tests/
  unit/           Vitest unit tests
  integration/    Vitest integration tests — Phase 2 onward
  e2e/            Playwright end-to-end tests
  fixtures/       Test fixtures, including the eventual July 2026 reconciliation fixture (Phase 5)
docs/
  SRS.md                          Authoritative requirements spec (read-only)
  PROJECT_PLAN.md                 Phase-by-phase implementation plan
  REQUIREMENTS_TRACEABILITY.md    Every requirement mapped to its phase
  UI_REQUIREMENTS.md              Skeleton — filled in once the Stitch handoff arrives
  ui/screenshots/, ui/stitch-export/   Placeholder locations for the Stitch design assets
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
