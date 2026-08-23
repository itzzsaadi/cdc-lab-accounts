# Open Questions Against `docs/SRS.md` v3.0

`docs/SRS.md` is read-only (`CLAUDE.md` §2). Where its text is internally
inconsistent, the discrepancy is recorded here and raised with the client
— never silently resolved by guessing in code. This file is the standing
list; each entry states what was built in the meantime and why.

---

## 1. July 2026 reconciliation figures vs. Appendix A initial data

**Status: resolved for engineering purposes, still open with the client.**

SRS §11.3 says the duplicate `AT WASTE` line (Rs 8,000) in the original
July 2026 workbook was an error and "is one fixed monthly bill, not two."
Appendix A.2 lists `AT WASTE` once. Loading Appendix A literally therefore
gives total expenses of Rs 1,287,459 and profit of Rs 208,076 — but AC-02
and SRS §2.1 both require Rs 1,295,459 and Rs 200,076, which are the
_uncorrected_, duplicate-`AT WASTE` figures.

**What was built:** ADR-0007 records the approved decision. The
reconciliation fixture (`tests/fixtures/july-2026-corrected.ts`) uses the
**corrected** single-`AT WASTE` dataset and asserts against the figures
that dataset actually produces, rather than forcing the uncorrected AC-02
targets out of corrected data. The fixture is a dataset of its own,
distinct from the literal Appendix A seed.

**What the client still needs to confirm:** whether AC-02's stated
figures should be updated to the corrected ones, or whether Appendix A.2
is missing an Rs 8,000 administration line. Until then, AC-02 cannot be
signed off exactly as written.

---

## 2. Requirement ID typo in SRS §2.2

**Status: resolved, no client action needed.**

The narrative says "Requirement FR-INC-06 gives those receipts a place to
live," but no `FR-INC-06` exists anywhere in the document. The actual
requirement for direct cash receipts is **FR-PINC-06** (SRS §3.3).
`FR-PINC-06` is treated as correct throughout; `FR-INC-06` is a
documentation typo with no functional consequence.

---

## 3. Appendix A.1 party count: heading says 27, table lists 26

**Status: open with the client. Does not block any phase.**

Appendix A.1's heading reads "Parties (27)", but the table beneath it
names only 26 — 4 daily-billing and 22 monthly-billing.

**What was built:** `prisma/seed.ts` loads exactly the 26 named parties.
No 27th party was invented to satisfy the heading's count, because a
fabricated party would appear in every picker, every report, and the
audit trail as though the client had asked for it.

This is asserted rather than left implicit: the clean-database rehearsal
(`npm run rehearse:migrations`) and `tests/integration/seed.test.ts` both
check for exactly 26, so the count cannot drift unnoticed in either
direction.

**What the client needs to confirm:** either the heading is wrong (26 is
correct), or a 27th party name is missing from the table and needs to be
supplied. If a name is supplied, it is a one-line seed addition plus a
count update in two places.

---

## 4. NFR-USE-05 and NFR-USE-08 were never assigned to a phase

**Status: resolved in Phase 8A.**

Both are cross-cutting requirements — workbook terminology
(Party, Counter Income, Direct Cash Receipt, Administration/Purchasing
Expenses, Instalment, Funding Source, Partner Investment, Operator,
Archive, PKR) and an English-only interface — that apply to every
UI-bearing phase but were never cited in any phase's requirement groups in
`docs/PROJECT_PLAN.md`.

They are verified by inspection at Phase 8A close and recorded in
`docs/REQUIREMENTS_TRACEABILITY.md` against Phase 8A rather than left
unanchored.
