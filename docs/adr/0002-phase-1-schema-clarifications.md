# ADR-0002: Phase 1 Schema Clarifications

## Status

Accepted.

## Context

Phase 1 (`docs/PROJECT_PLAN.md`) implements the full business database
schema from `docs/SRS.md` §6. During planning, several points were found
where the literal schema text either contradicts another part of the SRS,
is internally inconsistent, or cannot be built without a client-facing
technology decision the SRS does not make. `docs/SRS.md` is read-only
(`CLAUDE.md` §2) — none of it is edited to resolve these. This ADR records
each clarification, the alternatives considered, and the consequences, per
`CLAUDE.md` §23/`NFR-MNT-03`.

## Decisions

### 1. Table count: 12 vs. 13

SRS §6's introductory prose says "Twelve tables," but the same section
documents thirteen: `users`, `parties`, `expense_items`,
`expense_categories`, `vendors`, `daily_expenses`, `monthly_expenses`,
`party_income`, `counter_income`, `assets`, `capital_contributions`,
`audit_log`, `app_settings`. This is an inconsistency inside the SRS's own
text, not something introduced downstream. **Decision: thirteen is the
authoritative count.** `docs/PROJECT_PLAN.md` and
`docs/REQUIREMENTS_TRACEABILITY.md` are corrected to say thirteen (see the
Phase 1 completion report for the exact edits); `docs/SRS.md` itself is not
touched.

### 2. Better Auth `account` as the future authoritative password store

SRS §6 specifies `users.password_hash VARCHAR(255) NOT NULL`. Better Auth
1.7.1's default credential-provider flow stores the password hash in its
own `account.password` column (confirmed by inspecting the installed
package's schema-building source, `node_modules/@better-auth/core/dist/db/get-tables.mjs`
and `node_modules/@better-auth/core/dist/db/schema/{user,session,account,verification}.mjs`),
not on `user`. Three options were compared:

1. Force Better Auth to write into `users.password_hash` instead — requires
   overriding an undocumented internal credential-provider code path;
   highest migration risk on every future `better-auth` upgrade, highest
   maintenance cost for a project maintained long-term by a single
   developer (CON-07).
2. **Adopt Better Auth's `account.password` as the authoritative credential
   store; drop `users.password_hash`.** This is Better Auth's supported,
   documented default — no customization needed, and it keeps password
   hashing/rotation maintained upstream rather than hand-rolled, directly
   serving FR-AUTH-02's "current industry-standard hashing algorithm."
3. Defer the whole `account`/`session`/`verification` table question to
   Phase 2 — chosen in combination with option 2 (see next decision).

**Decision: option 2.** `users.password_hash` is omitted from the Phase 1
schema. This is a deliberate, disclosed deviation from SRS §6's literal
text, not an oversight — the column would otherwise sit unused once Better
Auth is wired up in Phase 2, and per CLAUDE.md §7's own principle of
matching what is actually built rather than a stale literal reading, an
always-empty required column is worse than omitting it with this record
attached. No business rule (FR-AUTH-01/02/06/07) is weakened; only the
storage location of one credential column moves.

### 3. Better Auth infrastructure tables deferred to Phase 2

`docs/PROJECT_PLAN.md` itself assigns "Better Auth configuration" to Phase
2 ("Authentication and Authorization"), not Phase 1 ("Database and Domain
Foundation"). Nothing in Phase 1's actual scope (the 13 SRS business
tables, `CHECK`s/triggers, domain functions, master-data seed) reads or
writes `session`, `account`, or `verification`. **Decision:** those three
tables are not created in Phase 1's migration at all; they are added in
Phase 2, at the point Better Auth is actually configured, along with the
`advanced.database.generateId: "uuid"` setting needed so its
application-generated IDs match `users.id UUID`.

### 4. `app_settings.updated_by` made nullable

SRS §6 states `app_settings.updated_by UUID NOT NULL`. Phase 1's seed
script must create the default 50/50 profit-split row (FR-MST-07 /
Appendix A.6) before any `users` row exists (Phase 1 seeds no users — see
decision 6 below). **Decision:** `updated_by` is made nullable, meaning
"system default, never edited by a user yet." Once an Admin actually
changes the split through the Phase 7 settings endpoint, that update sets
a real user id. This is the second disclosed, narrow deviation from SRS
§6's literal text in this phase, made for the same reason as decision 2 —
a `NOT NULL` column pointing at a table Phase 1 deliberately leaves empty.

### 5. Counter-income: non-blocking duplicate dates, no unique constraint

SRS §6's literal `counter_income.income_date` column says "UNIQUE where not
archived," but FR-CINC-04 (Must-have priority) requires the system to
"warn, without blocking, when a counter income entry already exists for
the chosen date." A partial unique index and a non-blocking warning cannot
both hold — inserting a second entry for an already-used date must either
fail (unique index) or succeed with a warning (FR-CINC-04). **Decision:**
FR-CINC-04's explicit, deliberate, Must-have behavioral requirement
controls. The partial unique index described in §6's DB-design chapter is
not implemented; a plain (non-unique) index on `income_date` is kept for
query performance, and the non-blocking warn-and-allow behavior is
implemented at the service/domain layer. This is flagged as an
SRS-internal inconsistency, not silently resolved by guessing.

### 6. Assets: `status` as the sole archive representation

SRS §6's `assets` table uses `status ENUM ('ACTIVE', 'ARCHIVED')`, not the
`is_archived` boolean every other financial-entry table uses.
**Decision:** `assets` never gains an `is_archived` column; `status`
remains the only archive representation for this table, matching the
literal schema. (`CLAUDE.md` §11's blanket "every financial entry table
carries `is_archived`" is corrected to name this exception — see the Phase
1 completion report.)

### 7. `client_uuid` scope — exactly four tables

DR-05 and `CLAUDE.md` §14 both specify `client_uuid` for offline-safe
idempotent upload. **Decision:** exactly `daily_expenses`,
`monthly_expenses`, `party_income`, and `counter_income` carry
`client_uuid UUID NOT NULL UNIQUE`. No other table — not `assets`, not
`capital_contributions`, not any master-data table — gets one, since none
of those are offline-enterable per FR-OFF-02/DR-05.

### 8. FK-only historical labels

No table carries a name-snapshot column for a party/vendor/expense
item/category at the time an entry referencing it was made. **Decision:**
if a master-data row is renamed, every historical entry referencing it
displays under the _current_ name the next time it is viewed — the
original wording at entry time is not preserved or reconstructable from
the live schema (it may be recoverable, as a separate forensic lookup,
from `audit_log`'s point-in-time snapshots if the rename itself was
audited). This is accepted for this release: DR-06, CON-05, and BR-14 are
worded around _figures_ and _referential integrity_, never around frozen
display text, and FK-only storage never alters any child row's foreign key
or amount on a rename. If frozen historical labels are ever wanted, that
is a materially bigger schema change (versioned master data or snapshot
columns) and would need its own Change Request per SRS §12.

## Alternatives Considered

Covered inline under each decision above — the rejected alternative for
the password-storage question (option 1: force Better Auth into
`users.password_hash`) and for the historical-label question (versioned
master data / snapshot columns) are the two with the most material
long-term cost difference; both were rejected primarily on CON-07
maintainability grounds and on the absence of any FR actually requiring
the stronger guarantee.

## Consequences

- `docs/SRS.md` is not modified; every deviation above is instead recorded
  here and cross-referenced from the Phase 1 completion report.
- Two `NOT NULL` columns from SRS §6's literal text
  (`users.password_hash`, `app_settings.updated_by`) are implemented
  differently (omitted / nullable respectively) than the literal text
  states, both disclosed here rather than silently changed.
- Phase 2 must configure Better Auth's `account` table as the credential
  store and its `advanced.database.generateId: "uuid"` setting before
  authentication can work; this ADR is the record that decision was
  already made, so Phase 2 does not need to re-litigate it.
- The counter-income partial unique index described in SRS §6 is
  deliberately not built; any future re-reading of SRS §6 in isolation
  should not "restore" it without re-reading this ADR first.

## Related SRS Requirements

`DR-05`, `DR-06`, `DR-07`, `DR-08`, `FR-AUTH-01`, `FR-AUTH-02`,
`FR-CINC-04`, `FR-MST-06`, `FR-MST-07`, `FR-OFF-02`, `CON-05`, `BR-14`,
SRS §6 (Database Design), Appendix A.6.

## Approval Status

Approved by the client/product owner as part of the Phase 1 plan
(Revision 3) approval. Implemented in Phase 1 per this record.
