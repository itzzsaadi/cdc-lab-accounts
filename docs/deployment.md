# Deployment Runbook

Status: skeleton, written in Phase 0. The real runbook is written once there
is something to deploy — production deployment is a **Phase 8** deliverable
(`docs/PROJECT_PLAN.md`), satisfying `NFR-MNT-04`.

This file will eventually cover:

- Deployment steps (cloud-hosted, per `docs/SRS.md` §2.7/CON-02).
- Rollback procedure.
- Backup schedule and the tested restore procedure (`NFR-REL-01` to `03`,
  `AC-12`).
- Environment variables required in production (kept in sync with
  `.env.example`).
