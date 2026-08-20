import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

/**
 * Prisma 7 requires an explicit driver adapter — there is no bare
 * `DATABASE_URL`-string fallback (confirmed by inspecting
 * `node_modules/@prisma/client/runtime/client.d.ts`). This factory takes
 * the connection string as an explicit argument rather than reading any
 * environment variable itself, so every caller (the seed script, test
 * helpers) is forced to say which database it means — never an implicit
 * default. See docs/testing.md for the safety rule this supports.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
