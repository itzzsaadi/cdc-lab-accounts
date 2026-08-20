# `src/lib/domain`

Pure, framework-agnostic financial calculation logic (Phase 1). No file
here imports `PrismaClient`, a Next.js API, or performs any I/O — every
function takes plain data in and returns a `Decimal` or plain object out,
so it is unit-testable with no server or database (`CLAUDE.md` §6/§25).

- `money.ts` — the project's `Decimal` type (re-exported from the
  generated Prisma client's `Prisma.Decimal`, the only reference to the
  ORM anywhere in this directory, kept to one file for isolation).
- `funding-source.ts` — the funding-source rule (BR-02/05/06/07, DR-07).
- `result.ts` — income/expense aggregation and net profit/loss
  (BR-01/02/03/04, FR-RES-04/05/07).
- `profit-split.ts` — the two-partner split with a deterministic
  remainder rule (BR-10/11, FR-RES-08) — see the module doc comment for
  the exact rounding rule, marked for confirmation before Phase 5.
- `investment.ts` — partner investment aggregation, including `DRAWING`
  sign handling (FR-INV-01/02, BR-06/08/11).

Unit tests: `tests/unit/domain/`.
