# Deploying CDC Lab Accounts to Vercel + Supabase — A Beginner's Guide

This guide assumes you have never used GitHub, Vercel, Supabase, Prisma,
environment variables, or DNS before. Follow it top to bottom, in order.
Every value you must type is shown in `code formatting`; every value that
is secret is shown as a placeholder like `<paste-your-value-here>` —
**never paste a real secret into a document, chat, or issue.**

**Nothing in this guide has been done for you.** No Supabase project, no
Vercel project, and no GitHub secret exists yet. You must create all of
them, in this order, before the automated pipeline can deploy anything.

---

## Part 1 — Supabase (the database)

### 1.1 Create the project

1. Open **https://supabase.com** in your browser.
2. Click **Start your project** (or **Sign in** if you already have an
   account). Sign in with GitHub when prompted — this is the easiest
   option and needs no new password.
3. Click the green **New project** button.
4. If asked to create an **Organization** first, click **New organization**,
   give it any name (e.g. `cdc-labs`), and choose the **Free** plan.
5. On the "Create a new project" screen:
   - **Name**: type `cdc-lab-accounts`.
   - **Database Password**: click **Generate a password**, then click the
     small copy icon next to it and **paste it somewhere safe on your own
     computer right now** (a password manager, or a local text file you
     will delete later — never a chat message or a GitHub issue). You
     will need this password in a moment and Supabase will not show it to
     you again.
   - **Region**: choose the region physically closest to Gujranwala,
     Pakistan. As of this writing Supabase does not offer a Pakistan
     region; choose **Mumbai (South Asia)** if available, otherwise the
     nearest region Supabase offers you (check the current list in the
     Region dropdown — it changes over time).
   - **Pricing Plan**: leave it on **Free**.
6. Click **Create new project**. Wait 1-3 minutes while Supabase
   provisions it — you'll see a progress screen.

### 1.2 Get the connection strings

1. Once the project is ready, click the **Connect** button near the top
   of the project page (or go to **Project Settings → Database** in the
   left sidebar).
2. You will see a **Connection string** panel with a dropdown — Supabase
   offers a few different connection modes. You need **two** of them:
   - **Transaction pooler** (sometimes labeled "Transaction" or shown
     with port `6543`) — this is your `DATABASE_URL`.
   - **Direct connection** (port `5432`) — this is your `DIRECT_URL`.
3. For each one, click the copy icon. The string looks like:
   `postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-xx-xxxx-x.pooler.supabase.com:6543/postgres`
4. Replace the literal text `[YOUR-PASSWORD]` in the copied string with
   the real database password you saved in step 1.1. Do this in a local
   text file, never on a public screen.
5. **How to avoid exposing the password**: never paste the finished
   connection string into a GitHub issue, a commit, a chat message, or a
   screenshot. It only ever goes into two places: a **Vercel environment
   variable** (Part 2) and a **GitHub Actions secret** (Part 3) — both of
   which are private, encrypted storage built for exactly this.

You now have two strings:

| What you copied                                               | Goes into                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Transaction pooler** string (port 6543), password filled in | Vercel env var `DATABASE_URL` (Part 2)                                                        |
| **Direct connection** string (port 5432), password filled in  | Vercel env var `DIRECT_URL` **and** GitHub secret `SUPABASE_DATABASE_URL` (Part 2 and Part 3) |

### 1.3 How the tables get created

You do not run any SQL by hand. The first time the GitHub Actions
pipeline runs (Part 4), one of its steps runs `prisma migrate deploy`
using `SUPABASE_DATABASE_URL` (the direct connection) — this applies
every migration already committed in this repository's
`prisma/migrations/` folder, in order, creating every table, trigger, and
constraint the application needs.

### 1.4 Confirm the tables exist

1. In the Supabase dashboard, click **Table Editor** in the left sidebar
   (after the pipeline in Part 4 has run at least once).
2. You should see tables named things like `users`, `daily_expenses`,
   `parties`, `audit_log`, and about a dozen others.
3. If the list is empty, the migration step in Part 4 has not run
   successfully yet — check the Actions tab in GitHub (Part 4.7) first.

### 1.5 Create the first Admin account

This step is deliberately **not automated** — it must be run once, by a
person, from a real terminal, so the one-time setup link it prints is
never captured by any log.

1. On your own computer, open a terminal in a copy of this repository
   (`git clone` it if you don't have one yet).
2. Run `npm ci` once if you haven't already.
3. Set the direct connection string as an environment variable for just
   this one command (replace the placeholder with your real Direct
   connection string from step 1.2):
   - macOS/Linux:
     `DATABASE_URL="<your-direct-connection-string>" npm run bootstrap:admin -- --email you@example.com`
   - Windows (PowerShell):
     `$env:DATABASE_URL="<your-direct-connection-string>"; npm run bootstrap:admin -- --email you@example.com`
4. The command refuses to run unless your terminal is interactive and
   unless zero users already exist — both are safety checks, not bugs.
5. It prints a one-time setup link directly to your terminal, with a
   warning above it. Copy that link and open it in your browser
   **immediately** (it expires in 24 hours and only works once) — set
   your Admin password there.
6. Do not paste that link anywhere except your own browser's address bar.

### 1.6 Create a manual backup

The Supabase **Free** plan does not include automated point-in-time
backups. Until you decide whether to upgrade for that, create a manual
backup yourself periodically:

1. In the Supabase dashboard, go to **Database → Backups** in the left
   sidebar. Supabase Free shows manual, on-demand backup/restore tooling
   here — follow the on-screen **Backup now** (or equivalent, current
   wording may vary) button.
2. Alternatively, from your own computer, with the CLI tool `pg_dump`
   installed, run (replace the placeholder with your real Direct
   connection string):
   ```
   pg_dump "<your-direct-connection-string>" --format=custom --file=cdc-lab-accounts-backup-$(date +%Y-%m-%d).dump
   ```
   Store the resulting `.dump` file somewhere private and safe (never
   commit it to Git). To restore it into a **different, empty** database
   later: `pg_restore --dbname="<a-different-connection-string>" cdc-lab-accounts-backup-2026-09-03.dump`.

---

## Part 2 — Vercel (the application)

### 2.1 Create the account and import the project

1. Open **https://vercel.com**.
2. Click **Sign Up**, then choose **Continue with GitHub**. Authorize
   Vercel to access your GitHub account when prompted.
3. On the Vercel dashboard, click **Add New...** → **Project**.
4. Under "Import Git Repository," find and click **Import** next to
   `itzzsaadi/cdc-lab-accounts`. If it isn't listed, click **Adjust GitHub
   App Permissions**, grant Vercel access to that repository, then come
   back and import it.

### 2.2 Configure the project before the first deploy

On the "Configure Project" screen:

1. **Framework Preset**: Vercel should auto-detect **Next.js** — leave it.
2. **Root Directory**: leave it as `./` (this repository's root — the
   Next.js app lives at the repository root, not in a subfolder).
3. **Branch**: this is configured after import, in Project Settings → Git
   — confirm the **Production Branch** is set to `main`.
4. Do **not** click Deploy yet — add the environment variables first (next section).

### 2.3 Add every environment variable

Still on the "Configure Project" screen (or afterward, in **Project
Settings → Environment Variables**), add each of these. For every one,
select **Production** as the environment (also tick **Preview** if you
want preview deployments to work too, but never use production secrets
for Preview — see the note at the end of this list).

| Name                 | Value comes from                                                                                                                         | Environments |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `DATABASE_URL`       | Supabase **Transaction pooler** string, password filled in (Part 1.2)                                                                    | Production   |
| `DIRECT_URL`         | Supabase **Direct connection** string, password filled in (Part 1.2)                                                                     | Production   |
| `BETTER_AUTH_URL`    | Your final production URL, e.g. `https://cdc-lab-accounts.vercel.app` (or your custom domain once attached) — must start with `https://` | Production   |
| `BETTER_AUTH_SECRET` | A freshly generated secret — run `openssl rand -base64 32` on your own computer's terminal and paste the output                          | Production   |
| `EMAIL_TRANSPORT`    | The literal text `smtp`                                                                                                                  | Production   |
| `SMTP_HOST`          | Your email provider's SMTP hostname                                                                                                      | Production   |
| `SMTP_PORT`          | Your email provider's SMTP port (commonly `587`)                                                                                         | Production   |
| `SMTP_USER`          | Your email provider's SMTP username                                                                                                      | Production   |
| `SMTP_PASSWORD`      | Your email provider's SMTP password                                                                                                      | Production   |
| `SMTP_FROM`          | The "from" address emails should show, e.g. `noreply@yourdomain.com`                                                                     | Production   |
| `LOG_STACKS`         | The literal text `false`                                                                                                                 | Production   |
| `DATABASE_POOL_MAX`  | The literal text `3` (recommended starting point for Supabase's free-tier pooler)                                                        | Production   |

Do not add `NODE_ENV` — Vercel sets this to `production` automatically.

> **Important about `BETTER_AUTH_URL`:** the application refuses to start
> if this is not a real `https://` URL. Set it to your actual Vercel
> deployment URL (visible after your first successful deploy, or your
> custom domain if you attach one) and redeploy if you change it later.

> **Preview environments**: if you tick "Preview" for any variable above,
> use a **separate** Supabase project and a **separate** `BETTER_AUTH_SECRET`
> for it — never point a Preview deployment at your real production
> database.

### 2.4 Get `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`

1. After the project exists (you can do this before or after the first
   deploy), go to your project's **Settings** tab in Vercel.
2. Scroll to the **General** section — you'll see **Project ID** printed
   directly on the page. Copy it.
3. For the **Org ID** (called "Team ID" for a personal account in some
   Vercel UI versions): go to your account/team **Settings** (click your
   avatar, top right → **Settings**), and find **Team ID** (or **Your ID**
   for a personal account) near the top of the General page. Copy it.
4. Both of these are IDs, not secrets, but treat them the same way as the
   rest — store them only in GitHub Secrets (Part 3), never in a public place.

### 2.5 Create a Vercel access token

1. Click your avatar (top right) → **Settings** → **Tokens** in the left
   sidebar (or go directly to **https://vercel.com/account/tokens**).
2. Click **Create Token**.
3. Give it a name like `github-actions-cdc-lab-accounts`.
4. Scope: choose the same team/account that owns this project.
5. Expiration: choose **No Expiration** or a long duration — a token that
   silently expires will quietly break every future deployment.
6. Click **Create**, then **copy the token immediately** — Vercel shows
   it exactly once. This is the `VERCEL_TOKEN` secret (Part 3).

### 2.6 Verify the first deployment (once you've done Part 3 and merged to `main`)

1. In your Vercel project, click the **Deployments** tab.
2. The newest deployment should show a green **Ready** status once the
   GitHub Actions pipeline finishes.
3. Click the deployment, then **Visit** to open the live site.
4. Visit `<your-url>/api/health` — you should see
   `{"status":"ok","database":"ok"}`. If you see `{"status":"error",...}`,
   the app is running but cannot reach Supabase — double-check
   `DATABASE_URL`.

### 2.7 Inspect build and runtime logs

- **Build logs**: open the specific deployment in the Deployments tab —
  the **Build Logs** panel shows everything from `vercel build`.
- **Runtime logs**: open the deployment, click the **Runtime Logs** (or
  **Functions**) tab — every request and every structured JSON log line
  this application emits appears here, in real time.

### 2.8 Redeploy safely

- **Preferred**: push a new commit to `main` (via a reviewed pull
  request) — the pipeline in Part 4 handles the rest automatically.
- **Manual re-run of the same code**: in Vercel's Deployments tab, find a
  previous deployment, click the **⋯** menu next to it, and choose
  **Redeploy**. This does not re-run migrations — only use it to
  re-deploy code that's already had its migrations applied.
- Never use **Promote to Production** on a deployment whose migrations
  you haven't separately confirmed are applied.

---

## Part 3 — GitHub (the pipeline)

### 3.1 Open repository settings

1. Go to **https://github.com/itzzsaadi/cdc-lab-accounts**.
2. Click the **Settings** tab (top of the repository page — you need
   admin access to the repository to see it).

### 3.2 Create each secret

1. In the left sidebar, click **Secrets and variables** → **Actions**.
2. Click the green **New repository secret** button.
3. Create each of the following, one at a time (exact **Name**, then
   paste the **Value**, then click **Add secret**):

| Name                    | Value                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`          | The token from Part 2.5                                                                                                                                                                                                             |
| `VERCEL_ORG_ID`         | The ID from Part 2.4                                                                                                                                                                                                                |
| `VERCEL_PROJECT_ID`     | The ID from Part 2.4                                                                                                                                                                                                                |
| `SUPABASE_DATABASE_URL` | Supabase's **Direct connection** string, password filled in (Part 1.2) — the _same_ value as Vercel's `DIRECT_URL`, but this is the only place it needs to also live in GitHub, because the migration step runs here, not on Vercel |

No other secret is needed. Every other environment variable (the pooled
`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `EMAIL_TRANSPORT`,
`SMTP_*`, `DATABASE_POOL_MAX`) lives **only** in Vercel (Part 2.3) — the
pipeline pulls those from Vercel itself via `vercel pull`, so nothing
about them is duplicated into GitHub.

### 3.3 Create the `production` Environment (recommended)

1. Still in **Settings**, click **Environments** in the left sidebar.
2. Click **New environment**, name it exactly `production`, click
   **Configure environment**.
3. Optionally tick **Required reviewers** and add yourself (or a
   teammate) — this makes every production deployment pause for a manual
   approval click before it runs, which is a good safety net while you're
   still getting comfortable with this pipeline. Save.

### 3.4 Confirm Actions are enabled

1. Click the **Actions** tab (top of the repository page).
2. If you see a message about Actions being disabled, go back to
   **Settings → Actions → General** and choose **Allow all actions and
   reusable workflows**, then **Save**.

### 3.5 Merge the deployment changes into `main`

This automation currently lives on a working branch, not `main` — it was
deliberately **not** merged for you (see the note at the end of this
document). When you're ready:

1. Open the repository on GitHub, click **Pull requests**, find the pull
   request for this branch (or open one: **Compare & pull request**).
2. Review the diff, then click **Merge pull request** → **Confirm merge**.

### 3.6 Watch the pipeline

1. Click the **Actions** tab.
2. Click the newest run, named **Deploy to Production**.
3. Each step from the numbered list runs top to bottom — click any step
   to expand its live log output.

### 3.7 Recognize success or failure

- **Success**: every step shows a green checkmark, and the final step
  (**Deploy prebuilt output to Vercel production**) completes. The run's
  overall status badge turns green.
- **Failure**: the run stops at the first red ✕ step and every step after
  it is skipped (shown grayed out) — this is intentional (per the
  pipeline's own design, no step is allowed to fail silently and let a
  later step run anyway). Click the red step to read the error.

### 3.8 Rerun a failed workflow

1. Open the failed run in the **Actions** tab.
2. Click **Re-run jobs** (top right) → **Re-run failed jobs** (or **Re-run
   all jobs** if you've since fixed something that affects earlier steps too).

### 3.9 Roll back

- **Fastest — Vercel-side**: Part 2.8's **Redeploy** on a known-good
  previous deployment. This only rolls back the _application code_, not
  the database — use this when the problem is a UI/logic bug, not a bad
  migration.
- **Git-side**: revert the bad commit (`git revert <commit-sha>`) on your
  own machine, push a new commit reverting it, and open a pull request as
  normal — merging it re-triggers the full pipeline, including a fresh
  Vercel deployment of the reverted code.
- **A bad migration has no automated rollback** (by design — see
  `docs/deployment.md` §5: Prisma migrations here are forward-only).
  Recovery from a bad migration is **restore from a backup** (Part 1.6),
  never an attempted reversal.

---

## What you must create yourself before anything can deploy

Everything above requires you, personally, to:

1. Create the Supabase project and copy its two connection strings (Part 1).
2. Create the Vercel project, add every environment variable, generate a
   token, and read off two IDs (Part 2).
3. Create four GitHub secrets and, optionally, the `production`
   Environment (Part 3).
4. Merge this branch into `main` yourself, when you are ready (Part 3.5)
   — this was deliberately left un-merged.

No step above has been performed on your behalf. Every placeholder in
this document is exactly that — a placeholder.
