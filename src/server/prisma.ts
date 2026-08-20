import { createPrismaClient } from "../../prisma/client";

/**
 * The single runtime PrismaClient for application code (server actions,
 * route handlers, the Better Auth adapter). Built from `DATABASE_URL`
 * explicitly, via the same factory Phase 1 established (`prisma/client.ts`)
 * — Prisma 7 has no bare-connection-string fallback, so every caller must
 * say which database it means (see docs/testing.md).
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

export const prisma = createPrismaClient(connectionString);
