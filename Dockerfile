# syntax=docker/dockerfile:1
#
# Production-shaped Docker image for reproducible local execution and CI
# validation ONLY — Vercel does not run this image. The application is
# deployed to Vercel through the official Vercel CLI (see
# .github/workflows/deploy-production.yml); this Dockerfile exists so the
# build and a real container boot + health check can be proven
# byte-for-byte reproducibly, independent of any specific host.
#
# Three stages: deps (install once, cached), builder (generate the Prisma
# client + `next build`), runner (the minimal, non-root runtime image —
# Next's `output: "standalone"` traces exactly the files each route needs,
# so the final image never carries devDependencies, the Next compiler, or
# the Prisma CLI/schema-engine binary).
#
# Node 20 matches package.json's engines field and CI's pinned version.
# Debian (not Alpine/musl) so the OpenSSL 3.0 runtime matches what
# `prisma migrate deploy` resolves locally/in CI (schema-engine-debian-
# openssl-3.0.x) — this image itself needs no Prisma engine binary at all:
# Prisma 7's query compiler is pure JS/WASM, and this app talks to
# Postgres through `@prisma/adapter-pg` (raw `pg`), never the classic Rust
# query engine. Migrations are applied as a separate CI/CLI step, never
# from inside this container.

FROM node:20-bookworm-slim AS base
WORKDIR /app

# ---- deps -------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma's custom generator output (generated/prisma) is excluded from the
# build context by .dockerignore, so it is always regenerated fresh here,
# never copied stale from the host.
RUN npx prisma generate

# `next build` runs with NODE_ENV=production internally, which triggers
# this app's fail-closed production guards (src/server/auth.ts) purely by
# importing the module during page-data collection — even though no
# route is actually invoked or connects to a real database at build time.
# These are the SAME non-secret, clearly-fake placeholder values
# .github/workflows/ci.yml's own "Build" step already uses for exactly
# this reason — never real credentials, and never carried into the final
# `runner` stage below (a multi-stage build ships only that stage's own
# layers).
ARG DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build_placeholder?schema=public"
ARG BETTER_AUTH_URL="https://build-placeholder.invalid"
ARG BETTER_AUTH_SECRET="build-time-placeholder-not-a-real-secret-0000000000"
ARG EMAIL_TRANSPORT="smtp"
ARG SMTP_HOST="smtp.build-placeholder.invalid"
ARG SMTP_PORT="587"
ARG SMTP_USER="build"
ARG SMTP_PASSWORD="build"
ARG SMTP_FROM="noreply@build-placeholder.invalid"
ENV DATABASE_URL=${DATABASE_URL} \
    BETTER_AUTH_URL=${BETTER_AUTH_URL} \
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} \
    EMAIL_TRANSPORT=${EMAIL_TRANSPORT} \
    SMTP_HOST=${SMTP_HOST} \
    SMTP_PORT=${SMTP_PORT} \
    SMTP_USER=${SMTP_USER} \
    SMTP_PASSWORD=${SMTP_PASSWORD} \
    SMTP_FROM=${SMTP_FROM} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runner -------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# The official node:*-slim images already ship a non-root "node" user
# (uid/gid 1000) — reused rather than creating a new one.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Defensive safety net for the custom-output Prisma client. Verified
# directly (booted .next/standalone/server.js on its own and hit
# /api/health successfully with no generated/ directory present at all):
# Turbopack inlines the generated client's compiled code straight into
# the traced server bundle's own chunks, so this copy is not required for
# the base case — kept anyway in case a future code path isn't captured
# by that static tracing. See docs/adr/0013 decision 5.
COPY --from=builder --chown=node:node /app/generated ./generated

USER node
EXPOSE 3000

# Uses the existing GET /api/health route (src/app/api/health/route.ts),
# which performs a real, timeout-bounded `SELECT 1` and returns a
# leak-free body — never the driver message, host, or database name.
# Plain Node (no curl/wget) keeps the final image minimal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
