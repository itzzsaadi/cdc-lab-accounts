import { buildAuth } from "../../../src/lib/auth/config";
import { getTestPrismaClient } from "./test-db";

/**
 * A Better Auth instance bound to the TEST_DATABASE_URL-backed Prisma
 * client (via the same `buildAuth` factory `src/server/auth.ts` uses for
 * the real app), so integration tests exercise real Better Auth flows
 * against the disposable test database — never `DATABASE_URL`.
 */
let instance: ReturnType<typeof buildAuth> | undefined;

export function getTestAuth() {
  instance ??= buildAuth(getTestPrismaClient(), "http://localhost:3000");
  return instance;
}
