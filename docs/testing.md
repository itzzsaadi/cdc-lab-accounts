# Test Plan and QA Checklist

Status: Phase 1 and Phase 2 test infrastructure in place. Filled in
further as each later phase's coverage is built — see `docs/PROJECT_PLAN.md`
for what each phase tests, and `docs/REQUIREMENTS_TRACEABILITY.md` for the
full requirement-to-test mapping.

## Test types

- **Unit** (`tests/unit/**`) — pure `src/lib/domain` functions against
  synthetic fixtures. No database, no server. Run by `npm run test`.
- **Integration** (`tests/integration/**`, excluding `constraints/`) —
  exercises the real Prisma Client against a real, disposable PostgreSQL
  database (the seed script's actual content, `client_uuid` behavior,
  etc.). Run by `npm run test` alongside unit tests.
- **Constraint/trigger** (`tests/integration/constraints/**`) — proves
  every `CHECK` constraint, trigger, and foreign-key delete rule added in
  the hand-edited migration SQL, via an actual failing insert/update/delete
  against real Postgres — never inferred from "no code path calls that."

## The test database — required from Phase 1 onward

Integration and constraint tests require a real PostgreSQL database and
refuse to run without one, per `tests/integration/helpers/test-db.ts`:

- Set `TEST_DATABASE_URL` (copy `.env.test.example` to `.env.test` and
  point it at a disposable database whose name ends in `_test`).
- The helper parses the URL and hard-fails if the database name does not
  end in `_test` — this is a deliberate guard against a misconfigured
  environment variable ever pointing truncation/cleanup at a development
  or production database.
- `TEST_DATABASE_URL` is never used as a fallback for `DATABASE_URL`, and
  vice versa — the two are always independent, and CLI commands intended
  for the test database always set `DATABASE_URL="$TEST_DATABASE_URL"`
  explicitly on that one command line (see the commands below), never via
  an edited `.env` file.
- Isolation between tests is by **truncation**, not transaction rollback:
  `resetDatabase()` runs one `TRUNCATE ... RESTART IDENTITY CASCADE`
  statement covering all 13 business tables, called from a `beforeEach`
  hook in every integration/constraint test file. This was chosen over
  Prisma's interactive `$transaction` rollback pattern, which is
  technically workable but requires strict, easy-to-miss discipline about
  routing every write through the transaction callback's parameter — see
  the Phase 1 plan for the full comparison.
- Integration/constraint tests run **serially** (`fileParallelism: false`
  in `vitest.config.mts`) since they share one real Postgres instance.

## Required local/CI commands (Phase 1 onward)

```bash
npx prisma generate                                          # after every schema change — Prisma 7 no longer does this automatically
npx prisma migrate dev --create-only --name <name>            # scaffold a new migration (dev database, via DATABASE_URL)
npx prisma migrate deploy                                     # apply to the dev-equivalent database
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy    # apply the same migration to the test database — explicit override, never implicit
npx prisma migrate status                                     # verify no drift
npx prisma db seed                                             # seed whichever database DATABASE_URL currently points at
npm run test                                                   # unit + integration + constraint tests together
```

## Why Prisma needs a driver adapter at all

Prisma 7's generated `PrismaClient` requires an explicit driver adapter
(`@prisma/adapter-pg`, wrapping `pg`) — there is no bare
`DATABASE_URL`-string connection path at runtime, confirmed by reading
`node_modules/@prisma/client/runtime/client.d.ts` directly. `prisma.config.ts`'s
`datasource.url` is read only by Prisma CLI commands (`migrate`, `db seed`,
`validate`), never by the Client itself — every runtime `PrismaClient` in
this project (the seed script, the test helpers) is built via
`prisma/client.ts`'s `createPrismaClient(connectionString)` factory, which
takes the connection string as an explicit argument rather than reading
any environment variable itself.

## Current coverage (Phase 1)

- **Unit** (`tests/unit/domain/`): funding-source rule, income/expense
  aggregation, net profit/loss, the deterministic profit-split remainder
  rule, and partner-investment aggregation (including `DRAWING` sign
  handling) — all against synthetic, non-July-2026 fixtures, all proving
  exact `Decimal` arithmetic.
- **Integration/constraint** (`tests/integration/`): funding-source
  bidirectional exclusivity, partner-eligibility triggers (funded-by/
  purchased-by/partner_user_id), asset acquisition-mode exclusivity,
  monetary positivity constraints, `client_uuid` uniqueness on all four
  offline-capable tables, counter-income non-blocking duplicate dates,
  instalment idempotency (reject-duplicate-active and
  archive-then-correct), the audit-log append-only trigger, physical-
  deletion rejection on every protected table, foreign-key delete-rule
  inspection (no `CASCADE`/`SET NULL` anywhere), and the seed script's
  exact contents (master data present, zero users, zero transactions).

## Current coverage (Phase 2)

- **Unit** (`tests/unit/permissions/`, `tests/unit/auth/`): the centralized
  `requirePermission` role/permission logic; the production-HTTPS startup
  guard; the fail-closed email-transport guard (production requires SMTP,
  the dev/test file sink refuses to run when `NODE_ENV=production`).
- **Integration** (`tests/integration/auth/`, `tests/integration/constraints/auth-schema.test.ts`):
  `sessions.token`/`account (issuer, accountId)` uniqueness; `users`' Phase 1
  delete-rejection trigger still holds after the Phase 2 migration;
  `sessions`/`account`/`verification` are proven deletable (deliberately
  not trigger-protected); the invitation-gate token is proven to store
  only a SHA-256 digest, never the raw token; single-use and reissue-
  invalidates-all-prior-tokens behavior; a transient failure _after_ gate
  validation (an invalid password rejected by Better Auth's own
  `resetPassword`) is proven to leave the gate token valid for a retry,
  not burned; 10-consecutive-failure lockout including under concurrent
  requests; a locked/inactive account's session is proven to never reach
  the caller and to be revoked immediately; `audit_log` rows for every
  auth event, checked for the complete absence of any password, hash,
  token, or URL; cookie `Secure` attribute proven environment-aware (absent
  over HTTP, present when `NODE_ENV=production` with an HTTPS origin);
  sign-out, password reset, and deactivation each proven to reject a
  cookie captured _before_ that action, replayed after it.
- **Playwright e2e** (`tests/e2e/auth.spec.ts`): the Sign In screen renders
  the approved Stitch design; unknown-email and wrong-password produce the
  identical generic error; valid sign-in reaches the role-appropriate
  placeholder; an Operator is denied direct navigation to an Admin-only
  route; the session cookie is `HttpOnly`/`SameSite=Lax`; a cross-origin
  POST to the auth API is rejected. Fixtures are created through a
  test-only, `NODE_ENV`-guarded route (`src/app/api/test/seed-user/route.ts`)
  that exercises the real invitation-acceptance code path, rather than
  importing server modules directly into the Playwright process (which
  hits an unrelated ESM/CJS interop mismatch specific to Playwright's own
  TypeScript transform).

The July 2026 reconciliation fixture (`CLAUDE.md` §21, `AC-02`) — the
single most important regression test in the project — is built in
**Phase 5**, and only once the AT WASTE conflict (`CLAUDE.md` §27) is
resolved with the client. Phase 1's seed data deliberately contains no
July 2026 transaction amounts at all, so this conflict does not arise in
any test built so far.
