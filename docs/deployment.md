# Deployment Runbook

**Status: draft (Phase 8A).** Everything below that does not depend on a
chosen host is final. Everything that does — the provider, the backup
mechanism, the restore rehearsal, the monitoring wiring — is marked
**[8B]** and is written once the host is chosen and the first deployment
actually happens. `NFR-MNT-04` is not satisfied until those are filled in
and the restore has been rehearsed (`AC-12`).

**No deployment has been performed. No external resource has been
created.** Nothing in this file has been executed against a real host.

---

## 1. What this system is

A single Next.js (App Router) application plus one PostgreSQL 16
database. No queue, no cache, no object store, no background worker.
CON-02 requires hosting cost to be kept to a minimum, and SRS §4.1 sizes
this as a small-data system for one laboratory — so the target shape is
**one small app instance + one managed Postgres instance**, not a cluster.

Node.js **20 or newer** (`package.json` `engines`). CI pins 20.

---

## 2. Required environment variables

Every variable the application reads is listed in `.env.example`
(NFR-MNT-02). Production values:

| Variable                                                            | Production value                                  | Enforced how                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                      | Managed Postgres connection string                | Prisma CLI and the runtime adapter both read it; the app throws at start-up if unset |
| `BETTER_AUTH_URL`                                                   | The public **HTTPS** URL                          | `src/server/auth.ts` refuses to start in production if this is not `https:`          |
| `BETTER_AUTH_SECRET`                                                | **Freshly generated** — `openssl rand -base64 32` | See the warning below                                                                |
| `EMAIL_TRANSPORT`                                                   | `smtp`                                            | Production refuses to start on any other value                                       |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Real SMTP credentials                             | Production refuses to start if any is missing                                        |
| `NODE_ENV`                                                          | `production`                                      | Gates HSTS, `Secure` cookies, and the fail-closed guards above                       |
| `LOG_STACKS`                                                        | unset (or `true` only while actively diagnosing)  | Keeps stack traces out of the log stream by default                                  |

> **`BETTER_AUTH_SECRET` is a human step with no automated guard.**
> Better Auth refuses to start on _its own library default_, but
> `.env.example`'s placeholder (`change-me-generate-a-real-32-byte-secret`)
> is not that default and **would be accepted**. Generate a real one.
> Store it in the password manager, never in a document (SRS §10).

Secrets live in the host's environment configuration and the password
manager. Never in the repository — `.env` and `.env.*` are git-ignored.

---

## 3. First deployment

1. **Provision** the app instance and the managed Postgres instance. _[8B: record provider, region, tier, and monthly cost here.]_
2. **Set every environment variable** from §2. The app will refuse to start if any fail-closed condition is unmet — that is the intended behaviour, not a problem to work around.
3. **Apply migrations:** `npx prisma migrate deploy`.
   Never `prisma db push`, never a manual schema change (NFR-MNT-05).
   The from-zero path is rehearsed in CI (`npm run rehearse:migrations`), so this should be uneventful.
4. **Seed master data:** `npx prisma db seed`.
   Loads Appendix A's parties, expense items, categories, vendors, and the default 50/50 profit split. Seeds **zero users** and **zero transactions** by design (ADR-0002).
5. **Create the first Admin:** `npm run bootstrap:admin -- --email <real address>`.
   Refuses to run if any user already exists, and refuses to run without an interactive TTY so it can never become a pipeline step whose output is captured. It prints a one-time setup link **to that terminal only** — open it in a browser and set the password. Do not paste it anywhere else.
6. **Verify:** `GET /api/health` returns `{"status":"ok","database":"ok"}`. A `503` with `{"status":"error"}` means the app is up but cannot reach Postgres.
7. **Sign in** as the Admin and confirm the Administration Area loads.
8. **Configure the Partner A/B mapping** on the Monthly Summary screen. This is **write-once** — it cannot be changed afterwards without a code-level change, so confirm both partner identities before saving.

---

## 4. Routine deployment

1. Merge to the default branch; CI must be green (typecheck, lint, format, Prisma validate + format-drift, migrations to two databases, clean-DB rehearsal, seed, build, Vitest, Playwright, cross-engine smoke, `npm audit`).
2. Deploy the new build. _[8B: exact command or pipeline step.]_
3. Run `npx prisma migrate deploy` if the release contains a migration.
4. Confirm `/api/health`.

---

## 5. Rollback

**Application rollback:** redeploy the previous build or commit. Safe and
routine.

**Database rollback: there is none, and none is planned.** Prisma
migrations in this project are forward-only — no down-migration exists for
any of the 7 migrations, and several contain preflight checks and
backfills that have no meaningful inverse. Recovery from a bad migration
against real data is **restore from backup**, never an attempted
migration reversal.

This matters most exactly when someone is under pressure in an incident:
do not try to reverse a migration. Restore.

For any pre-production environment (dev, CI, test) recovery is simply to
drop and recreate the database, re-run `migrate deploy`, and re-seed.

_[8B: exact restore command, expected duration, and who to notify.]_

---

## 6. Backups _[8B]_

Requirements to satisfy (NFR-REL-01/02/03, AC-12):

- Automated backup at least every 24 hours.
- Retained at least 30 days, with one monthly backup retained 12 months.
- A **tested, documented** restore procedure — rehearsed into a clean
  environment, demonstrated live, not asserted.

Prefer the host's managed backups over a hand-rolled cron job (CON-07).

**Restore verification standard:** after restoring into a clean
environment, re-run the July 2026 reconciliation against the restored
data. A restore that produces the wrong figures is not a successful
restore, and a row count is not proof.

_[8B: provider mechanism, schedule, retention settings, restore steps,
and the dated record of the rehearsal.]_

---

## 7. Monitoring and logging _[8B partially]_

**Done (8A):** the application emits one JSON object per line to
stdout/stderr (`src/lib/observability/logger.ts`), redacting secret-shaped
keys and free-text credentials/tokens and refusing to serialize binary
payloads. Next's `src/instrumentation.ts` hook routes uncaught server
request errors into that stream without headers or query strings.

`/api/health` performs a real, timeout-bounded database check and returns
a leak-free body.

_[8B: wire an uptime check against `/api/health`; set an alert on
`"level":"error"` lines; record the alerting destination. NFR-REL-07's 99%
monthly availability is a target to monitor against, plus a documented
maintenance-window policy.]_

---

## 8. Operational notes

- **Single instance assumed.** The per-user rate limiter holds state in
  process memory (`src/lib/rate-limit.ts`), so running two instances would
  give each the full quota. Replace it with a shared store before scaling
  horizontally. The account lockout is database-backed and unaffected.
- **No month locking exists** (CON-06, BR-12). Every record stays editable
  indefinitely; the audit log is the only record of what changed. Treat
  any request to "lock last month" as a Change Request, not a bug.
- **Archive, never delete.** Physical deletion of any financial,
  master-data, settings, user, or audit row is rejected by database
  trigger. If a delete appears necessary, the answer is archiving.
- **`sync_operations` retention** (`cleanupExpiredSyncReceipts`, 180 days)
  is a plain callable function, deliberately not wired into a scheduler
  that does not exist yet. _[8B: decide whether to schedule it.]_
