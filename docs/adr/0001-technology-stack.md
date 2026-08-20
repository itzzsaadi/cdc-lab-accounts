# ADR-0001: Technology Stack

## Status

Accepted.

## Context

CON-07 (`docs/SRS.md` §2.8) states this system will be maintained long-term
by a single developer, and that simplicity and documentation take priority
over performance optimisation. The system also has hard, non-negotiable
correctness requirements around money (`DR-01`), server-side authorization
(`FR-AUTH-08`, `NFR-SEC-03`), and offline data entry with reliable sync
(`FR-OFF-01` to `14`). The stack needs to satisfy all of that with a small,
well-understood set of dependencies rather than a large, bespoke one.

`CLAUDE.md` §4 already fixes the stack as a permanent project rule. This ADR
records the reasoning behind that choice and the alternatives considered, per
`NFR-MNT-03`.

## Decision

- **Next.js (App Router)** for routing, server logic, and the eventual PWA
  shell (Phase 6). Rejected alternative: a separate SPA + API server pair
  (Vite/React + Express/Fastify) — more moving parts for a single
  maintainer, and duplicates what App Router already gives us (server
  actions, route handlers, file-based routing) in one deployable unit.
- **TypeScript, strict mode** for the compile-time safety a single
  long-term maintainer benefits from most. No alternative seriously
  considered — untyped JS would undermine `NFR-MNT-08`.
- **PostgreSQL** as the only supported database — mature, well-documented,
  strong `NUMERIC` decimal support (`DR-01`), and cheap to host at this
  project's scale (`CON-02`, `NFR-PERF` sizing basis in `docs/SRS.md` §4.1).
- **Prisma** for schema, migrations, and queries. Rejected alternative:
  Drizzle ORM — comparable safety, but Prisma's migration tooling and
  schema-as-single-source-of-truth model is a better fit for a
  single-developer, long-lived project per `NFR-MNT-05`.
- **Better Auth** for authentication. Rejected alternative: Auth.js/NextAuth
  — both are viable; Better Auth was chosen for its more direct, less
  magic-heavy session/role model, which maps cleanly onto the three-role
  (`Operator`/`Partner`/`Admin`) requirement in `FR-AUTH-03`.
- **Tailwind CSS** for styling — utility-first, minimal custom CSS to
  maintain, and it will receive the Google Stitch design's tokens directly
  once that handoff happens, without needing a separate component-styling
  layer.
- **Zod** for schema validation, used identically on every server write
  path (`NFR-SEC-05`). Rejected alternative: Yup — Zod's TypeScript-first
  inference is a better fit given the strict-TS requirement.
- **Vitest** for unit/integration tests. Rejected alternative: Jest — Vitest
  shares configuration/tooling with the Vite ecosystem already used by
  Playwright's test runner conventions, and starts faster in a small
  single-developer feedback loop.
- **Playwright** for end-to-end tests. Rejected alternative: Cypress —
  Playwright's multi-browser support maps directly onto `NFR-CMP-01`
  (Chrome/Edge/Firefox/Safari).
- **Dexie** (added in Phase 6 only) for the offline IndexedDB queue — not
  installed yet; recorded here because it is part of the fixed stack.

## Consequences

- No second ORM, validation library, test runner, or auth library is
  introduced without a new ADR, per `CLAUDE.md` §4/§24.
- The stack is deliberately conventional and well-documented upstream,
  trading some flexibility for the maintainability CON-07 asks for.
