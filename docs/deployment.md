# Deployment Runbook

**Status: provider chosen, automation built, no deployment performed
yet.** The host is now chosen — **Vercel** (application) + **Supabase**
(PostgreSQL) + **GitHub Actions** (CI/CD) — and the full account-setup and
deployment procedure is written up, beginner-oriented, in
`docs/VERCEL_SUPABASE_DEPLOYMENT.md`. See
`docs/adr/0013-production-deployment-vercel-supabase.md` for the
decisions and code changes this required. The restore rehearsal (`AC-12`)
and monitoring wiring below remain **[8B]** until performed against the
real Supabase project.

**No deployment has been performed. No external resource has been
created.** Nothing in this file has been executed against a real host —
`docs/VERCEL_SUPABASE_DEPLOYMENT.md` explicitly tells you what you must
create yourself before anything deploys.

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

| Variable                                                            | Production value                                                                                                                        | Enforced how                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                      | Supabase's **pooled** ("Transaction pooler") connection string — set only in Vercel                                                     | The runtime Prisma adapter reads it directly; the app throws at start-up if unset                 |
| `DIRECT_URL`                                                        | Supabase's **direct** connection string — set in Vercel (as `DIRECT_URL`) and in GitHub Actions (as the `SUPABASE_DATABASE_URL` secret) | `prisma.config.ts` uses it for every CLI migration command; falls back to `DATABASE_URL` if unset |
| `DATABASE_POOL_MAX`                                                 | `3` (recommended starting point)                                                                                                        | Optional; bounds each serverless instance's connection pool (`src/server/prisma.ts`)              |
| `BETTER_AUTH_URL`                                                   | The public **HTTPS** URL                                                                                                                | `src/server/auth.ts` refuses to start in production if this is not `https:`                       |
| `BETTER_AUTH_SECRET`                                                | **Freshly generated** — `openssl rand -base64 32`                                                                                       | See the warning below                                                                             |
| `EMAIL_TRANSPORT`                                                   | `smtp`                                                                                                                                  | Production refuses to start on any other value                                                    |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Real SMTP credentials                                                                                                                   | Production refuses to start if any is missing                                                     |
| `NODE_ENV`                                                          | `production`                                                                                                                            | Gates HSTS, `Secure` cookies, and the fail-closed guards above                                    |
| `LOG_STACKS`                                                        | unset (or `true` only while actively diagnosing)                                                                                        | Keeps stack traces out of the log stream by default                                               |

> **`BETTER_AUTH_SECRET` is a human step with no automated guard.**
> Better Auth refuses to start on _its own library default_, but
> `.env.example`'s placeholder (`change-me-generate-a-real-32-byte-secret`)
> is not that default and **would be accepted**. Generate a real one.
> Store it in the password manager, never in a document (SRS §10).

Secrets live in the host's environment configuration and the password
manager. Never in the repository — `.env` and `.env.*` are git-ignored.

---

## 3. First deployment

See `docs/VERCEL_SUPABASE_DEPLOYMENT.md` for the full, beginner-oriented,
click-by-click account setup. Summarized:

1. **Provision** a Supabase project (Free tier; region chosen closest to
   Gujranwala, Pakistan available at the time) and a Vercel project
   linked to this repository. Monthly cost at Free tier for both: **Rs 0**
   until usage or storage limits are exceeded — record the actual figure
   here once a paid tier is chosen.
2. **Set every environment variable** from §2, in Vercel's Project
   Settings. The app will refuse to start if any fail-closed condition is
   unmet — that is the intended behaviour, not a problem to work around.
3. **Apply migrations:** `.github/workflows/deploy-production.yml` runs
   `npx prisma migrate deploy` against `SUPABASE_DATABASE_URL` (Supabase's
   direct connection) automatically on every push to `main`.
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

1. Merge to the default branch; `ci.yml` must be green (typecheck, lint, format, Prisma validate + format-drift, build — build validation only, no test suites; see ADR-0014).
2. `.github/workflows/deploy-production.yml` fires automatically on the
   merge to `main` (also runnable manually via `workflow_dispatch`): it
   re-validates (typecheck/lint/format/Vitest/Prisma validate), builds and
   validates the Docker image, applies any new migration to Supabase via
   `prisma migrate deploy`, then builds and deploys through the official
   Vercel CLI (`vercel build` + `vercel deploy --prebuilt --prod`). Only
   one production deployment runs at a time (GitHub Actions concurrency
   group `production-deploy`) — see
   `docs/adr/0013-production-deployment-vercel-supabase.md`.
3. Confirm `/api/health` on the live Vercel URL once the workflow finishes.

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

## 6. Backups _[8B — mechanism chosen, not yet rehearsed]_

Requirements to satisfy (NFR-REL-01/02/03, AC-12):

- Automated backup at least every 24 hours.
- Retained at least 30 days, with one monthly backup retained 12 months.
- A **tested, documented** restore procedure — rehearsed into a clean
  environment, demonstrated live, not asserted.

Prefer the host's managed backups over a hand-rolled cron job (CON-07).
**Supabase's Free tier does not include automated point-in-time backups**
meeting the 24-hour/30-day/12-month schedule above — a paid tier
(Pro or higher) is required to satisfy NFR-REL-01/02/03 automatically.
Until that tier decision is made, `docs/VERCEL_SUPABASE_DEPLOYMENT.md`
§1.6 documents the manual `pg_dump`/`pg_restore` commands as an interim,
human-run backup — not a substitute for the automated requirement.

**Restore verification standard:** after restoring into a clean
environment, re-run the July 2026 reconciliation against the restored
data. A restore that produces the wrong figures is not a successful
restore, and a row count is not proof.

_[8B: decide the Supabase tier that provides automated backups meeting
the schedule above, then perform and record a dated live restore
rehearsal against it.]_

---

## 7. Monitoring and logging _[8B partially]_

**Done (8A):** the application emits one JSON object per line to
stdout/stderr (`src/lib/observability/logger.ts`), redacting secret-shaped
keys and free-text credentials/tokens and refusing to serialize binary
payloads. Next's `src/instrumentation.ts` hook routes uncaught server
request errors into that stream without headers or query strings.

`/api/health` performs a real, timeout-bounded database check and returns
a leak-free body. On Vercel, every log line this application emits is
visible in the deployment's **Runtime Logs** tab
(`docs/VERCEL_SUPABASE_DEPLOYMENT.md` §2.7) — no separate log shipping is
configured yet.

_[8B: wire an uptime check against `/api/health`; set an alert on
`"level":"error"` lines (e.g. via a Vercel log drain or an external
uptime monitor pointed at `/api/health`); record the alerting
destination. NFR-REL-07's 99% monthly availability is a target to monitor
against, plus a documented maintenance-window policy.]_

---

## 8. Operational notes

- **Single instance assumed — now genuinely multi-instance on Vercel.**
  The per-user rate limiter holds state in process memory
  (`src/lib/rate-limit.ts`); Vercel runs each request on a serverless
  function instance, so this limiter's quota is now effectively per warm
  instance, not per deployment — a known, disclosed relaxation of the
  original single-instance assumption, not a new bug. Replace it with a
  shared store (e.g. a small Postgres table or a rate-limiting service) if
  this needs to be exact under real concurrent abuse. The account lockout
  is database-backed and unaffected.
- **Workbook upload limit exceeds Vercel's fixed platform ceiling.**
  `MAX_IMPORT_FILE_BYTES` is 5 MB; Vercel's Serverless Functions enforce a
  fixed, non-configurable 4.5 MB request-body limit, returning `413`
  before the application's own check runs, for any file between ~4.5 MB
  and 5 MB. See `docs/adr/0013-production-deployment-vercel-supabase.md`
  decision 9 — flagged for a client decision, not silently changed here.
- **No month locking exists** (CON-06, BR-12). Every record stays editable
  indefinitely; the audit log is the only record of what changed. Treat
  any request to "lock last month" as a Change Request, not a bug.
- **Archive, never delete.** Physical deletion of any financial,
  master-data, settings, user, or audit row is rejected by database
  trigger. If a delete appears necessary, the answer is archiving.
- **`sync_operations` retention** (`cleanupExpiredSyncReceipts`, 180 days)
  is a plain callable function, deliberately not wired into a scheduler
  that does not exist yet. _[8B: decide whether to schedule it.]_
