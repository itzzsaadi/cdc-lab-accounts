# `tests/integration`

Integration and constraint tests against a real, disposable PostgreSQL
database — required from **Phase 1** onward, not Phase 2 as originally
planned here, since the database schema itself (constraints, triggers,
seed data) is exactly what Phase 1 needs to prove.

- `helpers/test-db.ts` — the `TEST_DATABASE_URL` safety guard (refuses to
  run against anything whose database name doesn't end in `_test`), the
  shared test `PrismaClient`, and the truncate-between-tests reset helper.
- `helpers/fixtures.ts` — throwaway `users`/`parties`/etc. rows for tests
  only, never seeded through `prisma/seed.ts`.
- `constraints/` — one file per `CHECK`/trigger/index family added in
  `prisma/migrations/20260820170711_init/migration.sql`.
- `seed.test.ts` — proves the real seed script's exact contents (master
  data present, zero users, zero transactions).

API-route/server-action integration tests (once those exist, Phase 2
onward) belong alongside these, not in a separate directory.

See `docs/testing.md` for the required commands and the safety rules
around `TEST_DATABASE_URL`.
