# Change Request Log

Per SRS §12. Anything not in `docs/SRS.md` v3.0 requires a client-approved
Change Request before it is built — including everything on the
out-of-scope list (`CLAUDE.md` §26). This file is where those are
recorded.

**No change requests have been raised or approved to date.** Every feature
built through Phase 8A traces to a requirement already in the SRS.

---

## Format

| CR  | Date | Raised by | Change | SRS impact | Decision | Built in |
| --- | ---- | --------- | ------ | ---------- | -------- | -------- |
| —   | —    | —         | —      | —          | —        | —        |

---

## Deliberately not built (no CR raised)

Recorded so nobody later assumes these were forgotten. Each was
considered and set aside.

### Out of scope per SRS §1.3 / §11.1

Payroll, bank integration, payment gateways, patient registration,
diagnostic results, tax filing, accounting-package integration, asset
depreciation, instalment end dates and outstanding balances, month
closing and locking, separation of capital from running costs, partner
reimbursement and settlement transfers, multiple currencies, multiple
branches, native mobile apps, and an Urdu interface.

Several of these were **explicitly declined by the client** during the
v2.0 → v3.0 revision (SRS §11.1), not merely deferred — month locking,
capital/running-cost separation, and partner reimbursement in particular.
Building any of them "for flexibility" would contradict a decision the
client already made.

### In the SRS, deliberately not delivered in this release

These carry a requirement ID but were not built. Each is a Should or
Could priority, each has a recorded reason, and none blocks AC-01, which
covers **Must**-priority requirements.

| ID         | Priority | Requirement                                                               | Why not, and what it would take                                                                                                                                                                                                             |
| ---------- | -------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-DEXP-10 | Could    | Receipt photo attachment on an expense                                    | `PROJECT_PLAN.md` Phase 3 explicitly allows deferring this without blocking exit, and no later phase committed to it. Would need file storage, which this system otherwise has none of — a real addition to the hosting footprint (CON-02). |
| FR-CINC-05 | Should   | Show days in the current month with no counter income recorded            | Phase 3B noted it "may fold into Phase 5's warnings work"; it never firmed up into a commitment. Small: one query plus a warnings-panel entry.                                                                                              |
| FR-WARN-05 | Should   | Warnings dismissible for the current month when an omission is deliberate | Deferred with reasoning in ADR-0007 §5. Needs new per-user/per-month/per-warning dismissal state, which was outside the approved Phase 5 data model. Warnings currently display and cannot be dismissed.                                    |

If the client wants any of these, they are ordinary work items rather than
Change Requests — they are already in the SRS. They are listed here so the
gap is visible at sign-off rather than discovered afterwards.
