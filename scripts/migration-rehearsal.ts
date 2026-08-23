/**
 * Phase 8A — clean-database migration and seed rehearsal.
 *
 * Creates a **brand-new, uniquely named temporary database**, applies
 * every migration to it from zero, seeds it, verifies the seeded counts,
 * and drops it again. It never touches the development or test databases
 * — those are named explicitly in `.env`/`.env.test` and this script
 * refuses to run against either, because a rehearsal that destroys a
 * working environment is worse than no rehearsal.
 *
 * What it is actually for: `prisma migrate deploy` against an
 * already-migrated database is a no-op, so a migration that only works
 * on an existing schema (this project's later migrations contain
 * preflight `DO $$ ... RAISE EXCEPTION` blocks and backfill `UPDATE`s
 * that read prior state) can pass every day and still fail the one time
 * it matters: the first production deploy. This proves the from-zero
 * path.
 *
 * Usage: `npm run rehearse:migrations`
 */
import "dotenv/config"; // run directly via `tsx`, not through Next.js — load `.env` before anything reads process.env
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createPrismaClient } from "../prisma/client";

// `.env.test` supplies TEST_DATABASE_URL, which this script reads only to
// make sure it never targets that database either.
loadEnv({ path: ".env.test" });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/** Swaps the database name in a Postgres URL, keeping credentials/host/params. */
function withDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function databaseNameOf(connectionString: string): string {
  return new URL(connectionString).pathname.replace(/^\//, "");
}

async function main(): Promise<void> {
  const adminUrl = requireEnv("DATABASE_URL");
  const devName = databaseNameOf(adminUrl);
  const testName = process.env.TEST_DATABASE_URL
    ? databaseNameOf(process.env.TEST_DATABASE_URL)
    : null;

  const rehearsalName = `cdc_rehearsal_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  // Guard, not decoration: the whole point is that this can only ever
  // create and drop a database it invented itself.
  if (rehearsalName === devName || rehearsalName === testName) {
    throw new Error("Refusing to run: the generated rehearsal name collides with a real database.");
  }
  if (!rehearsalName.startsWith("cdc_rehearsal_")) {
    throw new Error("Refusing to run: rehearsal database name is not a generated rehearsal name.");
  }

  // `postgres` is the maintenance database — CREATE/DROP DATABASE cannot
  // run inside a connection to the database being created or dropped.
  const maintenance = createPrismaClient(withDatabase(adminUrl, "postgres"));
  const rehearsalUrl = withDatabase(adminUrl, rehearsalName);

  console.log(`Creating temporary database ${rehearsalName} …`);
  await maintenance.$executeRawUnsafe(`CREATE DATABASE "${rehearsalName}"`);

  try {
    const env = { ...process.env, DATABASE_URL: rehearsalUrl };

    console.log("Applying every migration from zero …");
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });

    console.log("Checking for drift …");
    execFileSync("npx", ["prisma", "migrate", "status"], { env, stdio: "inherit" });

    console.log("Seeding master data …");
    execFileSync("npx", ["prisma", "db", "seed"], { env, stdio: "inherit" });

    const seeded = createPrismaClient(rehearsalUrl);
    try {
      // The Appendix A figures, asserted against a database that has only
      // ever seen the migrations and the seed — no accumulated test data.
      const counts = {
        parties: await seeded.party.count(),
        dailyParties: await seeded.party.count({ where: { billingMode: "DAILY" } }),
        expenseItems: await seeded.expenseItem.count(),
        adminCategories: await seeded.expenseCategory.count({ where: { expenseGroup: "ADMIN" } }),
        purchasingCategories: await seeded.expenseCategory.count({
          where: { expenseGroup: "PURCHASING" },
        }),
        vendors: await seeded.vendor.count(),
        users: await seeded.user.count(),
        dailyExpenses: await seeded.dailyExpense.count(),
        assets: await seeded.asset.count(),
      };

      const expected = {
        // 26, exactly as Appendix A.2 lists them. SRS Appendix A.1's
        // heading says "Parties (27)" — that discrepancy is unresolved
        // with the client and is recorded, not papered over by inventing
        // a 27th party. See docs/SRS-open-questions.md.
        parties: 26,
        dailyParties: 4,
        expenseItems: 22,
        adminCategories: 15,
        purchasingCategories: 9,
        vendors: 9,
        users: 0,
        dailyExpenses: 0,
        assets: 0,
      };

      const mismatches = Object.entries(expected).filter(
        ([key, value]) => counts[key as keyof typeof counts] !== value,
      );

      console.log("\nSeeded counts:", counts);
      if (mismatches.length > 0) {
        throw new Error(
          `Seed verification failed: ${mismatches
            .map(
              ([key, value]) =>
                `${key} expected ${value}, got ${counts[key as keyof typeof counts]}`,
            )
            .join("; ")}`,
        );
      }
      console.log("\n✓ Clean-database migration and seed rehearsal passed.");
    } finally {
      await seeded.$disconnect();
    }
  } finally {
    console.log(`Dropping temporary database ${rehearsalName} …`);
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${rehearsalName}" WITH (FORCE)`);
    await maintenance.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
