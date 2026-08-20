import { createPrismaClient } from "../../../prisma/client";
import type { PrismaClient } from "../../../generated/prisma/client";

/**
 * Safety guard (Phase 1 plan §18): integration/constraint tests must never
 * run against a real database. This never falls back to `DATABASE_URL` —
 * `TEST_DATABASE_URL` is required, and its parsed database name must end
 * in `_test`, or this throws instead of connecting.
 */
export function getTestDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration/constraint tests refuse to run without an explicit test-only database URL (see docs/testing.md).",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`TEST_DATABASE_URL is not a valid URL: "${raw}".`);
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL must point at a database whose name ends in "_test" (got "${databaseName}"). Refusing to run — this guard exists specifically so a misconfigured environment variable can never point cleanup/truncation at a development or production database.`,
    );
  }

  return raw;
}

let client: PrismaClient | undefined;

export function getTestPrismaClient(): PrismaClient {
  client ??= createPrismaClient(getTestDatabaseUrl());
  return client;
}

/**
 * Truncate-between-tests isolation (Phase 1 plan §18 — chosen over
 * `$transaction` rollback to avoid the tx-parameter-discipline footgun).
 * Table order does not matter with CASCADE. `users` and `app_settings` are
 * deliberately included so every business table starts each test empty.
 */
export async function resetDatabase(): Promise<void> {
  const prisma = getTestPrismaClient();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "daily_expenses", "monthly_expenses", "party_income", "counter_income",
      "capital_contributions", "assets", "parties", "expense_items",
      "expense_categories", "vendors", "audit_log", "app_settings", "users",
      "sessions", "account", "verification"
    RESTART IDENTITY CASCADE
  `);
}
