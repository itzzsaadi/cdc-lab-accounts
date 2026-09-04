# ADR-0014: `ci.yml` reduced to build validation only (no test suites)

## Status

Accepted, at the user's explicit direction, over the objection raised
below.

## Context

`CLAUDE.md` §5 requires `npm run test` and `npm run test:e2e` (in
addition to typecheck/lint/format/Prisma checks/build) to pass "before
any commit is considered complete," and `.github/workflows/ci.yml` had
enforced that full suite (Vitest unit/integration/constraint tests, a
clean-database migration/seed rehearsal, and the full Playwright suite
including a cross-engine smoke) on every push and pull request since
Phase 1.

The user asked directly for `ci.yml` to be updated to drop all test
steps and "just deploy." This was flagged twice before making the
change: once noting the direct conflict with `CLAUDE.md` §5, and once
distinguishing "strip tests from `ci.yml`" from "fold deployment into
`ci.yml`." The user confirmed, explicitly, both that tests should be
removed from `ci.yml` entirely and that `ci.yml` and
`deploy-production.yml` should remain separate workflows (`ci.yml`
build-validation only; `deploy-production.yml`, unchanged, is still the
only workflow that runs migrations/tests and deploys).

## Decision

`ci.yml` now runs only: checkout → install → generate Prisma Client →
type check → lint → format check → validate Prisma schema → Prisma
schema format check → build. No live database service is defined (none
of the remaining steps need one — verified directly: a real
`next build` with no reachable Postgres and no `.env` file present
completes successfully, since no route uses `generateStaticParams` or
`force-static` prerendering that would query the database at build
time). No Vitest, no migration/seed rehearsal, no `npm audit`, no
Playwright, no cross-engine smoke.

`deploy-production.yml` is unchanged: it still runs the complete Vitest
suite and applies committed migrations to the real database before
building and deploying — it remains the one workflow that gates an
actual production deployment on tests actually passing.

## Consequences

- **`CLAUDE.md` §5's test requirement is no longer enforced by CI on
  every push/PR.** A pull request or a push to `main` can now go green
  without a single unit, integration, constraint, or end-to-end test
  having run in that job. `npm run test` and `npm run test:e2e` must be
  run manually/locally before a commit for §5 to actually be satisfied
  — CI no longer catches a regression there.
- A broken feature (passing typecheck/lint/build but failing tests)
  can now land on `main` undetected by `ci.yml`. The only remaining
  automated backstop is `deploy-production.yml`'s own Vitest run, which
  only fires on a push to `main` (i.e., after the fact, not before merge
  on a PR) and never runs Playwright at all.
- This is recorded here, rather than left as a silent contradiction of
  `CLAUDE.md` §5, per §23's requirement that a significant deviation be
  documented with context and the alternative (keeping full test
  coverage in `ci.yml`) that was available and rejected.

## Alternatives rejected

- **Keeping the full suite in `ci.yml`** — this is what `CLAUDE.md` §5
  itself calls for, and was offered explicitly; the user declined it in
  favor of a faster, test-free CI gate.
- **Folding deployment into `ci.yml` itself** — offered as a second
  option alongside this one; the user chose to keep `ci.yml` and
  `deploy-production.yml` as two separate workflows instead.
