# ADR-0013: Production Deployment — Vercel, Supabase, GitHub Actions, Docker

## Status

Accepted. **No deployment has been performed and no external account or
resource has been created as part of this ADR.** This records the
automation and configuration only; the first real deployment happens
after the user creates the Supabase project, the Vercel project, and the
GitHub secrets described in `docs/VERCEL_SUPABASE_DEPLOYMENT.md`.

## Context

Phase 8A left `docs/deployment.md` with every host-dependent section
marked `[8B]`. This ADR fills in the concrete provider choice (Vercel +
Supabase, GitHub Actions, no Render) and the code/config changes needed
to deploy safely — without touching business rules, permissions, schema,
or the SRS-derived domain logic.

## Decisions

1. **Vercel hosts the Next.js application; Supabase hosts PostgreSQL;
   GitHub Actions drives CI/CD.** Docker is used only to build and
   validate the application reproducibly (locally and in CI) — Vercel
   does not run the Docker image. The application is deployed through the
   official Vercel CLI (`vercel build` + `vercel deploy --prebuilt`), per
   the explicit instruction that Vercel does not run arbitrary containers.

2. **`next.config.ts` sets `output: process.env.VERCEL ? undefined : "standalone"`
   — standalone only for the Docker image, never for a Vercel build.**
   Standalone output is needed for a minimal, correct Docker runtime image
   (a traced `node_modules` subset instead of the full tree). The first
   real `vercel build` run in this project's pipeline failed with
   `ENOENT: .../.next/next-server.js.nft.json` — `output: "standalone"`
   changes how/whether Next emits that trace manifest, and `vercel
build`'s own packaging step reads it directly; this is a confirmed,
   version-matching, known incompatibility (`vercel/next.js#43654`,
   "Standalone server does not work with `vercel build` output" — that
   same issue thread shows Next.js itself already keys other
   standalone-vs-Vercel build decisions off this exact `VERCEL` system
   env var, which Vercel sets automatically in every build/runtime
   environment, `vercel build` CLI included). Verified directly, both
   ways, after the fix: building locally with `VERCEL=1` set produces no
   `.next/standalone` directory and _does_ produce
   `.next/next-server.js.nft.json`; building without it (plain
   `npm run build`, and the Docker builder stage) produces
   `.next/standalone` exactly as before. The original claim in this
   decision — that Vercel's pipeline was simply "compatible" with
   standalone output regardless — was wrong; corrected here rather than
   left standing.

3. **`prisma.config.ts`'s CLI-only datasource URL now prefers
   `DIRECT_URL`, falling back to `DATABASE_URL`.** Prisma 7's driver
   adapter model (`@prisma/adapter-pg`) means the _running application_
   (`src/server/prisma.ts`) never reads `prisma.config.ts` at all — it
   builds its own `PrismaPg` adapter directly from `DATABASE_URL`. Only
   Prisma CLI commands (`migrate deploy`, `db seed`, `validate`) read this
   file, and those commands need a direct, session-mode Postgres
   connection — Supabase's pooled "Transaction pooler" (Supavisor,
   pgbouncer transaction mode) does not support the advisory locks and
   multi-statement DDL `prisma migrate` relies on. In production,
   `DATABASE_URL` becomes Supabase's **pooled** connection string (what
   the running app uses for every query) and `DIRECT_URL` becomes
   Supabase's **direct** connection string (what CLI migration commands
   use). Locally and in CI, `DIRECT_URL` stays unset and everything
   falls back to the single unpooled `DATABASE_URL` already in use today
   — no behavior change outside production.

4. **`createPrismaClient` gained an optional `maxPoolSize` parameter**,
   read from a new optional `DATABASE_POOL_MAX` env var in
   `src/server/prisma.ts` (parsed by a pure, unit-tested
   `src/lib/db/pool-config.ts`). Each running instance holds its own
   `pg.Pool`; on Vercel, many concurrent serverless instances each
   opening `pg.Pool`'s default of 10 connections could collectively
   exhaust Supabase's free-tier pooler slot count. Left unset, behavior
   is byte-for-byte unchanged (pg's own default of 10) — this only
   matters if the production environment variable is explicitly set.

5. **`generated/prisma` (the custom Prisma Client output) is not present
   as a separate directory in `.next/standalone`, and does not need to
   be.** Verified directly: after a real `next build`, booting
   `.next/standalone/server.js` on its own (with only `.next/static`
   copied alongside it, no `generated/` directory present at all) and
   hitting `/api/health` returned `200 {"status":"ok","database":"ok"}`
   — Turbopack inlines the generated client's compiled code directly
   into the traced server bundle's own chunks rather than leaving it as
   an external file. The Dockerfile still copies `generated/` from the
   builder stage into the runner stage as a defensive safety net (in
   case a future code path isn't captured by Turbopack's static
   tracing), but the base case does not depend on it — this is recorded
   here so a future engineer doesn't spend time re-diagnosing an
   apparently "missing" directory that was never required.

6. **No native Prisma query-engine binary ships in the runtime image or
   Vercel bundle.** Confirmed directly (`npx prisma -v` reports "Query
   Compiler: enabled" for this project's Prisma 7 + `prisma-client`
   generator + `@prisma/adapter-pg` combination) — the query engine is
   pure JS/WASM, and all Postgres I/O goes through the `pg` driver
   directly. The only Prisma-shipped native binary anywhere in this
   pipeline is the **Schema Engine**, used exclusively by CLI migration
   commands (in CI, never inside the Docker runtime image or the Vercel
   deployment). The Docker image's Debian (not Alpine/musl) base matches
   the `debian-openssl-3.0.x` schema-engine build already resolved
   locally/in CI, so `prisma generate`/`migrate` behave identically
   across every environment in this pipeline.

7. **Workbook uploads stay in-memory only — already true, unchanged.**
   `src/app/api/admin/import/preview/route.ts` reads the multipart body
   via `request.formData()` and never writes it to disk (verified by
   reading the route directly); nothing needed to change to satisfy
   "keep uploaded workbook bytes ephemeral."

8. **No Edge runtime anywhere.** Verified directly: no route in `src/app`
   declares `export const runtime = "edge"`; every Route Handler and
   Server Component defaults to the Node.js runtime, which is required
   for Prisma, Better Auth, `exceljs`, `pdfkit`, and `nodemailer`. Only
   `src/proxy.ts` (Next's middleware-equivalent) runs on the Edge
   runtime — by Next.js's own fixed convention, not a choice made here —
   and it never touches the database.

9. **A known, disclosed platform gap: the workbook upload limit exceeds
   Vercel's fixed request-body ceiling.** `MAX_IMPORT_FILE_BYTES` is 5 MB
   (`src/lib/validation/import.ts`, an approved business constant — not
   changed here). Vercel's Serverless/Node.js Functions enforce a fixed,
   non-configurable 4.5 MB request-body limit at the infrastructure
   level, returning `413 FUNCTION_PAYLOAD_TOO_LARGE` **before the
   application's own check ever runs**, for any upload between ~4.5 MB
   and the app's own 5 MB ceiling. This is a genuine platform constraint,
   not a bug in this codebase, and is **not silently fixed here** — it is
   flagged for the client to decide (accept the narrower practical limit,
   or raise a Change Request to lower `MAX_IMPORT_FILE_BYTES` to safely
   under 4.5 MB). See `docs/VERCEL_SUPABASE_DEPLOYMENT.md`.

10. **`docker-compose`/`compose.yaml` never creates a production
    database.** By default it runs only the `app` service, reading
    `DATABASE_URL` (and the rest) from the user's own `.env` — which, for
    anything resembling production parity, points at Supabase. An
    optional `postgres` service exists behind the `local-db` Compose
    profile, never started automatically, purely for a fully offline
    local dev loop.

11. **`SUPABASE_DATABASE_URL` is the one GitHub secret for migrations.**
    It holds Supabase's **direct** connection string and is used only by
    the `prisma migrate deploy` step against `DIRECT_URL`. Every other
    runtime secret (`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
    `EMAIL_TRANSPORT`, `SMTP_*`, the pooled `DATABASE_URL`,
    `DATABASE_POOL_MAX`) lives **only** in the Vercel project's own
    environment variables, pulled by `vercel pull`/`vercel build` — never
    duplicated into GitHub Actions secrets.

## Alternatives rejected

- **Render** — explicitly excluded by instruction.
- **Deploying the Docker image itself** (e.g. to a container host) —
  rejected; the explicit target is Vercel, which does not run arbitrary
  containers. Docker here is a validation/reproducibility tool only.
- **A second production Postgres instance for local Docker Compose** —
  rejected; Compose either points at the real Supabase database (via env
  vars) or, optionally, a clearly-local-only Postgres behind a profile
  that is never started by default.
- **Prisma's classic Rust query engine / a `binaryTargets` override** —
  unnecessary; this project's Prisma 7 + driver-adapter setup has no
  native query-engine binary to target in the first place (decision 6).

## Consequences

- First deployment requires the manual account/secret setup in
  `docs/VERCEL_SUPABASE_DEPLOYMENT.md` — this ADR and the automation it
  describes do not perform that setup.
- `.github/workflows/deploy-production.yml` runs on every push to `main`
  and is the only workflow that touches the real Supabase database or
  Vercel; `ci.yml` (existing, unchanged) continues to gate every push and
  PR with the full validation suite including Playwright.
- The Docker image is never the production deployment artifact — it
  exists solely so the build and a real container boot/health check can
  be proven reproducibly, independent of Vercel's own build pipeline.
