# Test Plan and QA Checklist

Status: skeleton, written in Phase 0. Filled in as each phase's test
coverage is built — see `docs/PROJECT_PLAN.md` for what each phase tests,
and `docs/REQUIREMENTS_TRACEABILITY.md` for the full requirement-to-test
mapping.

Current state:

- `npm run test` (Vitest) — one trivial sanity test, proving the harness
  works. No domain-logic tests exist yet (Phase 1).
- `npm run test:e2e` (Playwright) — one smoke test against the Phase 0
  placeholder health page. No feature e2e tests exist yet (Phase 2 onward).

The July 2026 reconciliation fixture (`CLAUDE.md` §21, `AC-02`) — the single
most important regression test in the project — is built in **Phase 5**,
and only once the AT WASTE conflict (`CLAUDE.md` §27) is resolved with the
client.
