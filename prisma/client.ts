import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Prisma 7 requires an explicit driver adapter — there is no bare
 * `DATABASE_URL`-string fallback (confirmed by inspecting
 * `node_modules/@prisma/client/runtime/client.d.ts`). This factory takes
 * the connection string as an explicit argument rather than reading any
 * environment variable itself, so every caller (the seed script, test
 * helpers) is forced to say which database it means — never an implicit
 * default. See docs/testing.md for the safety rule this supports.
 *
 * `maxPoolSize` is optional and defaults to `pg.Pool`'s own default (10).
 * On a serverless host (Vercel), each warm function instance holds its
 * own pool, and Supabase's free-tier pooler has a bounded number of
 * client slots — `src/server/prisma.ts` passes a small explicit value in
 * production so many concurrent instances can't collectively exhaust it.
 */
export function createPrismaClient(connectionString: string, maxPoolSize?: number): PrismaClient {
  const adapter = new PrismaPg({ connectionString, max: maxPoolSize });
  return new PrismaClient({ adapter });
}
