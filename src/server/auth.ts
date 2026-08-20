import { buildAuth } from "../lib/auth/config";
import { assertEmailConfigured } from "../lib/email/transport";
import { assertProductionRequiresHttps } from "../lib/auth/production-guards";
import { prisma } from "./prisma";

/**
 * The application's single Better Auth instance (CLAUDE.md §6 — config
 * lives in lib/auth, the instance itself lives here). Built by calling the
 * framework-agnostic factory in `src/lib/auth/config.ts` with the shared
 * `DATABASE_URL`-bound Prisma client; integration tests call the same
 * factory with a `TEST_DATABASE_URL`-bound client instead (see
 * tests/integration/helpers/test-db.ts).
 */

const isProduction = process.env.NODE_ENV === "production";
const baseURL = process.env.BETTER_AUTH_URL;

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is not set.");
}

// Mandatory production hardening (Phase 2 plan §2/§19 decision 16): a
// hard, independent assertion — never trust NODE_ENV-based cookie
// defaults alone to keep production honest about serving over HTTPS.
assertProductionRequiresHttps(baseURL, isProduction);

// Fails fast if production SMTP configuration is incomplete, or if
// EMAIL_TRANSPORT is unset/invalid anywhere — see src/lib/email/transport.ts.
assertEmailConfigured();

export const auth = buildAuth(prisma, baseURL);
