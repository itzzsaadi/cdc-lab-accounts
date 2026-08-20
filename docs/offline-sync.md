# Offline Sync Design Note

Status: skeleton, written in Phase 0. This is the highest-risk area of the
system (`docs/SRS.md` §3.10) and is documented here separately, in detail,
once it is actually built in **Phase 6** — see `docs/PROJECT_PLAN.md`.

Nothing about offline synchronization is implemented before Phase 6. This
file will eventually cover:

- The `client_uuid`-based idempotent upload mechanism (`DR-05`, `FR-OFF-06`).
- The Dexie-backed local queue design.
- The conflict-resolution strategy for `FR-OFF-08` (keep both versions,
  ask the user — never auto-discard), recorded as its own ADR per
  `CLAUDE.md` §23.
- How `NFR-MNT-07`'s automated test coverage (conflict handling, repeated
  upload safety) is structured.
