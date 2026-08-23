# Handover Document — Draft

**Status: draft (Phase 8A).** The structure and every engineering-side
fact are final. Every row marked **[8B]** needs a real value that does not
exist yet because nothing has been deployed and no external account has
been created.

**Rule for this document: no password, key, or connection string is ever
written here.** Those live in the client's password manager. This file
records _what exists and who controls it_, never how to authenticate to
it (SRS §10).

---

## 1. What was built

The CDC Lab Accounts & Asset Management System replaces the manual Excel
workbook used to record daily income and expenses and work out the monthly
profit or loss. It reproduces in software exactly what was already done by
hand — it does not introduce new accounting practice (SRS §1.2).

- One Next.js (App Router) application, TypeScript throughout.
- One PostgreSQL 16 database.
- Works offline on a device and syncs when the connection returns.
- Three roles: Operator (reception), Partner, Admin.

---

## 2. Accounts and access **[8B]**

| Item                 | Value                                              | Who controls it | Renewal  |
| -------------------- | -------------------------------------------------- | --------------- | -------- |
| Domain name          | **[8B]**                                           | **[8B]**        | **[8B]** |
| DNS provider         | **[8B]**                                           | **[8B]**        | —        |
| TLS certificate      | **[8B]** — expected to be provider-managed         | **[8B]**        | **[8B]** |
| Application hosting  | **[8B]**                                           | **[8B]**        | **[8B]** |
| Database hosting     | **[8B]**                                           | **[8B]**        | **[8B]** |
| SMTP / email sending | **[8B]**                                           | **[8B]**        | **[8B]** |
| Source repository    | `itzzsaadi/cdc-lab-accounts` (GitHub)              | Client          | —        |
| Password manager     | **[8B]** — holds every credential referenced above | Client          | **[8B]** |

---

## 3. System accounts

- The **first Admin** is created once, on the deployed system, by
  `npm run bootstrap:admin -- --email <address>`. It refuses to run if any
  user already exists and refuses to run without an interactive terminal.
  It prints a one-time setup link to that terminal only.
- Every other account is created by an Admin inviting them from the Users
  screen. There is no public sign-up.
- **At least one active Admin must always exist.** The database itself
  refuses to deactivate or demote the last one. An Admin also cannot
  demote their own account or remove their own partner status — ask
  another Admin.
- Deactivating a user, changing their role, or changing their partner
  status signs them out everywhere immediately.

**[8B: record who holds Admin, Partner, and Operator accounts at handover
— names and roles only, never passwords.]**

---

## 4. Day-to-day operation

The two one-page guides in `docs/user-guides/` are the client-facing
documents:

- `operator-guide.pdf` — reception's daily routine.
- `partner-guide.pdf` — monthly work, results, and reports.

Regenerate them with `npm run docs:guides` if a workflow changes.

---

## 5. Things that will surprise a new engineer

Written down because each one looks like a bug until you know why.

1. **Nothing is ever deleted.** Physical deletion of any financial,
   master-data, settings, user, or audit row is rejected by a database
   trigger. "Delete" in the UI always means archive.
2. **There is no month closing or locking.** The client declined it
   explicitly. Every record stays editable forever; the audit log is the
   only safeguard. Treat "lock last month" as a Change Request.
3. **No profit, loss, share, or investment total is ever stored.** They
   are recalculated from the underlying entries on every view. This is why
   changing the profit split changes what past months display — there was
   never a stored figure to preserve.
4. **Partner-funded expenses are never repaid in cash.** They raise that
   partner's investment total, and they still appear in expense listings
   by category so spending never disappears from view.
5. **Money is `Decimal` end to end**, never a JavaScript number. The July
   2026 reconciliation does not reproduce exactly under floating point.
6. **Migrations are forward-only.** No down-migration exists. Recovery
   from a bad migration against real data is restore-from-backup, never a
   reversal attempt.
7. **The rate limiter is single-instance.** Running two app instances
   would give each the full quota. See `docs/security-review.md` §6.
8. **`docs/SRS.md` is read-only.** Where it is internally inconsistent,
   the discrepancy is recorded in `docs/SRS-open-questions.md` and raised
   with the client, never silently resolved in code. Two entries there are
   still open.

---

## 6. Where everything is

| What                                 | Where                               |
| ------------------------------------ | ----------------------------------- |
| Requirements (authoritative)         | `docs/SRS.md`                       |
| Open questions against the SRS       | `docs/SRS-open-questions.md`        |
| Requirement-to-implementation matrix | `docs/REQUIREMENTS_TRACEABILITY.md` |
| Phase plan and status                | `docs/PROJECT_PLAN.md`              |
| Architecture overview                | `docs/architecture.md`              |
| Design decisions and why             | `docs/adr/` (ADR-0001 to 0010)      |
| Offline sync design                  | `docs/offline-sync.md`              |
| Deployment runbook                   | `docs/deployment.md`                |
| Security review                      | `docs/security-review.md`           |
| Test plan and coverage               | `docs/testing.md`                   |
| Change log                           | `CHANGELOG.md`                      |
| Change request log                   | `docs/change-requests.md`           |
| Local setup                          | `README.md`                         |
| Environment variables                | `.env.example`                      |
| User guides (PDF)                    | `docs/user-guides/`                 |

---

## 7. Running it locally

Covered in `README.md` (NFR-MNT-01 requires a competent engineer to get
there within 30 minutes). In short: PostgreSQL 16, `npm ci`, copy
`.env.example` to `.env`, `npx prisma migrate deploy`, `npx prisma db
seed`, `npm run dev`.

Full validation before any commit:

```
npm run typecheck && npm run lint && npm run format:check
npx prisma validate && npx prisma format
npm run test
npm run test:e2e
npm run build
```

---

## 8. Still outstanding at handover **[8B]**

- Production deployment, backups, and a rehearsed restore (AC-12).
- Real-device browser verification (NFR-CMP-02) and Excel/Google Sheets
  export verification (NFR-CMP-03).
- Two further historical months reconciled against the client's workbooks
  (AC-03) — needs those workbooks.
- Unaided walkthroughs by both partners and one operator (AC-14).
- The two open SRS questions in `docs/SRS-open-questions.md`.
