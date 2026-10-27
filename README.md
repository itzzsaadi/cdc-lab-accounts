# CDC Lab Accounts & Asset Management System

CDC Lab Accounts is a Next.js application that replaces the CDC
Laboratories, Gujranwala Excel workbook for recording income, expenses,
partner investment, assets, and monthly profit or loss. It preserves the
workbook's accounting model while providing role-based access, audit history,
offline entry, synchronization, reports, and administration.

This README is the practical starting point for running and using the
repository. The complete functional specification is
[`docs/SRS.md`](docs/SRS.md), which is read-only. Engineering and business
rules are maintained in [`CLAUDE.md`](CLAUDE.md).

## What the application provides

- **Operator workflows:** daily expenses, party income, counter income,
  offline entry, and sync status.
- **Partner workflows:** monthly expenses, assets, Partner Investment,
  monthly results, dashboards, reports, and audit history.
- **Admin workflows:** users and invitations, parties, expense items,
  expense categories, vendors, profit split, and historical import.
- **Financial safeguards:** Decimal-based money calculations, server-side
  Zod validation, role checks on every server operation, append-only audit
  history, and archive instead of physical deletion.
- **Offline support:** entries can be captured in the browser's IndexedDB
  queue and synchronized later with duplicate-safe client UUIDs.

## Roles and access

| Role         | Main capabilities                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operator** | Record daily expenses, party income, counter income, and offline entries. Operators cannot access profit, loss, investment, or profit-split data. |
| **Partner**  | Everything an Operator can do, plus monthly expenses, assets, Partner Investment, monthly results, reports, and audit history.                    |
| **Admin**    | Everything a Partner can do, plus users, master lists, profit split, and historical import.                                                       |

## Prerequisites

- Node.js 20 or later
- npm
- PostgreSQL 16 or later
- Two PostgreSQL databases for full local validation:
  - a development database referenced by `DATABASE_URL`
  - a separate database whose name ends in `_test`, referenced by
    `TEST_DATABASE_URL`

The application itself only needs the development database. The test database
is required by integration and constraint tests.

## Install and run locally

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run bootstrap:admin -- --email you@cdclabs.example
npm run dev
```

Before running the commands, edit `.env` and set `DATABASE_URL` to your local
PostgreSQL database. On macOS/Linux, the equivalent copy command is:

```bash
cp .env.example .env
```

Open [http://localhost:3000/sign-in](http://localhost:3000/sign-in). The
bootstrap command creates the first Admin and prints a one-time setup link in
the terminal. Open that link to set the Admin password. The bootstrap command
is intentionally interactive, refuses to run if a user already exists, and
must not be used as an automated pipeline step.

Check database connectivity with:

```text
GET http://localhost:3000/api/health
```

When the database is reachable, the response is:

```json
{ "status": "ok", "database": "ok" }
```

### Local email behavior

The template uses `EMAIL_TRANSPORT=file`, which is intended for development
and testing. Password-reset and invitation messages are appended to the
git-ignored `.local/mail.log` file rather than sent through a real provider.
For a real deployment, set `EMAIL_TRANSPORT=smtp` and provide every `SMTP_*`
value.

## Configuration

Copy `.env.example` to `.env` and configure these variables:

| Variable                                                            | Local use                                | Production use                                               |
| ------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`                                                      | PostgreSQL development connection string | Supabase pooled/transaction connection string                |
| `DIRECT_URL`                                                        | Leave empty                              | Supabase direct connection for Prisma migrations and seeding |
| `DATABASE_POOL_MAX`                                                 | Optional                                 | Optional per-instance connection-pool limit                  |
| `BETTER_AUTH_URL`                                                   | `http://localhost:3000`                  | Public HTTPS application URL                                 |
| `BETTER_AUTH_SECRET`                                                | Use a local secret                       | Generate a fresh secret; never use the template placeholder  |
| `EMAIL_TRANSPORT`                                                   | `file`                                   | `smtp`                                                       |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Required only for SMTP                   | Required                                                     |
| `LOG_STACKS`                                                        | Usually `false`                          | Keep `false` unless diagnosing an issue                      |

Production startup rejects an HTTP `BETTER_AUTH_URL`, incomplete SMTP
configuration, and file-based email transport. Never commit `.env` files or
secrets.

## Using the application

After signing in, use the role-specific navigation:

1. **Set up master data (Admin):** confirm parties, expense categories,
   expense items, vendors, users, and the profit-split configuration.
2. **Enter daily activity (Operator/Partner/Admin):** record Daily Expenses,
   Party Income, and Counter Income. Use the offline entry screen when the
   network is unavailable.
3. **Review and synchronize offline work:** open Sync Center when connected,
   inspect queued or conflicted entries, and retry synchronization when needed.
4. **Record monthly activity (Partner/Admin):** enter Administration Expenses,
   Purchasing Expenses, and instalment expenses.
5. **Maintain assets (Partner/Admin):** record cash-purchased or instalment
   assets according to their acquisition mode. Assets are archived, not
   physically deleted.
6. **Review results (Partner/Admin):** use Monthly Summary, Dashboard,
   Party Income reports, and exports to review income, expenses, profit/loss,
   and partner shares.
7. **Review investment (Partner/Admin):** Partner Investment is derived from
   capital contributions, partner-funded expenses, and cash asset purchases.
8. **Review history (Partner/Admin):** Audit Log records creation, changes,
   and archiving of financial records and authentication events.

### Important accounting behavior

- Business-funded expenses reduce profit.
- Partner-funded expenses remain visible in reports, do not reduce profit,
  and increase the named partner's investment.
- Instalment assets create ordinary monthly expenses.
- Cash asset purchases are not expenses; they increase the purchasing
  partner's investment.
- Profit, loss, shares, and investment totals are calculated from source
  records when requested; they are not stored as editable totals.
- All amounts are PKR and must be positive monetary values.

## Available commands

| Command                                        | Purpose                                                        |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                                  | Start the Next.js development server                           |
| `npm run build`                                | Create a production build                                      |
| `npm run start`                                | Run the production build                                       |
| `npm run typecheck`                            | Run TypeScript without emitting files                          |
| `npm run lint`                                 | Run ESLint                                                     |
| `npm run format`                               | Format the repository with Prettier                            |
| `npm run format:check`                         | Check Prettier formatting                                      |
| `npm run test`                                 | Run Vitest unit, integration, and constraint tests             |
| `npm run test:e2e`                             | Run Playwright end-to-end tests                                |
| `npm run rehearse:migrations`                  | Create, migrate, seed, verify, and remove a temporary database |
| `npm run docs:guides`                          | Regenerate Operator and Partner PDF guides                     |
| `npm run bootstrap:admin -- --email <address>` | Create the first Admin account                                 |
| `npx prisma generate`                          | Generate the Prisma Client                                     |
| `npx prisma migrate deploy`                    | Apply committed migrations                                     |
| `npx prisma db seed`                           | Load Appendix A master data                                    |
| `npx prisma validate`                          | Validate the Prisma schema                                     |
| `npx prisma format`                            | Format the Prisma schema                                       |
| `docker compose build`                         | Build the production-shaped Docker image                       |

For integration tests, copy `.env.test.example` to `.env.test` and set
`TEST_DATABASE_URL` to a disposable database ending in `_test`. Tests may
truncate that database between cases; never point it at a development or
production database.

The standard validation set is:

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run test
npx prisma validate
npx prisma format
npm run build
```

Run `npm run test:e2e` separately when browser coverage is required.

## Deployment

The selected production architecture is **Vercel** for the Next.js
application, **Supabase** for PostgreSQL, and **GitHub Actions** for
validation, migrations, and deployment. The detailed setup guide is
[`docs/VERCEL_SUPABASE_DEPLOYMENT.md`](docs/VERCEL_SUPABASE_DEPLOYMENT.md).
The operational runbook is [`docs/deployment.md`](docs/deployment.md).

Deployment principles:

1. Use Supabase's pooled connection as `DATABASE_URL` for the running app.
2. Use Supabase's direct connection as `DIRECT_URL` for Prisma CLI commands.
3. Apply versioned migrations with `npx prisma migrate deploy`; never use
   `prisma db push` against a deployed database.
4. Run `npx prisma db seed` only when initializing the master data.
5. Keep credentials in Vercel/GitHub secrets and the password manager.
6. Review both workflows in `.github/workflows/` before changing release
   automation:
   - `ci.yml` performs build, type, lint, formatting, and Prisma validation.
   - `deploy-production.yml` performs deployment checks, migrations, Docker
     validation, and the Vercel deployment.

The repository also includes [`Dockerfile`](Dockerfile) and
[`compose.yaml`](compose.yaml) for reproducible local execution and CI
validation. Vercel deploys through its official build/deploy flow rather than
running this Docker image.

## Repository map

```text
src/app/                 Next.js screens and API route handlers
src/components/          Shared UI, layout, entries, offline, and admin components
src/lib/domain/          Framework-independent Decimal calculations
src/lib/validation/      Server-side Zod schemas
src/server/               Session-aware actions, queries, reports, import, and sync
prisma/                  Schema, seed data, and versioned migrations
scripts/                  Admin bootstrap, migration rehearsal, and guide generation
tests/unit/               Domain, validation, permissions, offline, and security tests
tests/integration/        PostgreSQL constraints, workflows, and acceptance tests
tests/e2e/                Playwright browser tests
docs/                     SRS, architecture, deployment, testing, and ADRs
```

## Further documentation

- [`docs/SRS.md`](docs/SRS.md) — authoritative requirements specification
- [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) — implementation phases
- [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md) —
  requirement coverage
- [`docs/testing.md`](docs/testing.md) — test strategy and validation evidence
- [`docs/architecture.md`](docs/architecture.md) — system architecture
- [`docs/handover.md`](docs/handover.md) — operational handover information
- [`docs/adr/`](docs/adr/) — architecture decisions
- [`docs/user-guides/`](docs/user-guides/) — generated Operator and Partner
  guides

## Troubleshooting

### Prisma cannot connect

Confirm PostgreSQL is running, `DATABASE_URL` is correct, and the database
exists. Then run `npx prisma migrate deploy` and retry
`npm run dev`.

### The app starts but sign-in emails do not arrive

In local development, check the file-based email output. In a deployed
environment, set `EMAIL_TRANSPORT=smtp` and verify all SMTP variables,
including `SMTP_FROM`.

### Prisma Client types are missing

Run:

```powershell
npx prisma generate
```

The generated client is required before type checking, linting, or building.

### An offline entry is not visible on the server

Open Sync Center after reconnecting, inspect the queue and conflict state, and
retry synchronization. Do not recreate the entry manually until the queued
entry has been resolved.
