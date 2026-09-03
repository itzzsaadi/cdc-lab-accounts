import { createPrismaClient } from "../../prisma/client";
import { parsePoolMax } from "../lib/db/pool-config";

/**
 * The single runtime PrismaClient for application code (server actions,
 * route handlers, the Better Auth adapter). Built from `DATABASE_URL`
 * explicitly, via the same factory Phase 1 established (`prisma/client.ts`)
 * — Prisma 7 has no bare-connection-string fallback, so every caller must
 * say which database it means (see docs/testing.md). This is always the
 * pooled connection string in production (Supabase's Supavisor/pgbouncer
 * URL) — `prisma.config.ts` is the only place `DIRECT_URL` matters, for
 * CLI-driven migrations, never here.
 *
 * `DATABASE_POOL_MAX` is optional; unset it locally and in CI (falls back
 * to `pg.Pool`'s own default of 10). Set it to a small number (e.g. `3`)
 * in production so many concurrent serverless instances can't
 * collectively exhaust Supabase's bounded pooler client slots.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

export const prisma = createPrismaClient(
  connectionString,
  parsePoolMax(process.env.DATABASE_POOL_MAX),
);
