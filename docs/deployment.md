# Deployment Runbook

Status: skeleton, written in Phase 0; database-migration notes added in
Phase 1. The full runbook is written once there is something to deploy —
production deployment is a **Phase 8** deliverable (`docs/PROJECT_PLAN.md`),
satisfying `NFR-MNT-04`.

This file will eventually cover:

- Deployment steps (cloud-hosted, per `docs/SRS.md` §2.7/CON-02).
- Rollback procedure.
- Backup schedule and the tested restore procedure (`NFR-REL-01` to `03`,
  `AC-12`).
- Environment variables required in production (kept in sync with
  `.env.example`), now including the driver-adapter connection string
  (`DATABASE_URL`, consumed both by the Prisma CLI via `prisma.config.ts`
  and by the application's own `createPrismaClient` factory at runtime).

## Migration recovery approach (Phase 1)

Prisma migrations are **not** automatically reversible — no down-migration
exists or is planned for `prisma/migrations/20260820170711_init/`. Recovery
differs by environment:

- **Any pre-production environment (dev/CI/test)**: recovery is to drop
  and recreate the database, then re-run `prisma migrate deploy` and the
  seed script. Safe, because no real data exists there.
- **Any environment with real data**: recovery is restore-from-backup
  (the tested procedure `AC-12` requires, Phase 8), never a migration
  rollback.

No destructive reset command (`prisma migrate reset`, a manual
`DROP DATABASE`, etc.) is run against any database — dev/CI/test included
— without explicit approval at the time.
