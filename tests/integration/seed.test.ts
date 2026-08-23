import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, getTestPrismaClient, resetDatabase } from "./helpers/test-db";

const prisma = getTestPrismaClient();
const PRISMA_CLI = fileURLToPath(
  new URL("../../node_modules/prisma/build/index.js", import.meta.url),
);

describe("Phase 1 master-data seed — master data only, no users, no credentials, no July transactions", () => {
  beforeEach(async () => {
    await resetDatabase();
    // Run the real seed script against the test database — the same
    // command a developer runs, with DATABASE_URL overridden to the
    // guarded test URL for this one invocation (Phase 1 plan §"Prisma 7
    // generation, migration, and seed commands").
    execFileSync(process.execPath, [PRISMA_CLI, "db", "seed"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
      stdio: "pipe",
    });
  });

  it("seeds zero users, zero credentials", async () => {
    expect(await prisma.user.count()).toBe(0);
  });

  it("seeds zero July (or any) transaction amounts", async () => {
    expect(await prisma.dailyExpense.count()).toBe(0);
    expect(await prisma.monthlyExpense.count()).toBe(0);
    expect(await prisma.partyIncome.count()).toBe(0);
    expect(await prisma.counterIncome.count()).toBe(0);
    expect(await prisma.capitalContribution.count()).toBe(0);
  });

  it("seeds zero assets (FR-AST-01 — the register starts empty)", async () => {
    expect(await prisma.asset.count()).toBe(0);
  });

  it("seeds the expected master data and the default profit-split setting", async () => {
    expect(await prisma.party.count()).toBe(26);
    expect(await prisma.party.count({ where: { billingMode: "DAILY" } })).toBe(4);
    expect(await prisma.expenseItem.count()).toBe(22);
    expect(await prisma.expenseCategory.count({ where: { expenseGroup: "ADMIN" } })).toBe(15);
    expect(await prisma.expenseCategory.count({ where: { expenseGroup: "PURCHASING" } })).toBe(9);
    expect(await prisma.vendor.count()).toBe(9);

    const profitSplit = await prisma.appSetting.findUniqueOrThrow({
      where: { settingKey: "profit_split" },
    });
    expect(profitSplit.splitAPercent?.toNumber()).toBe(50);
    expect(profitSplit.splitBPercent?.toNumber()).toBe(50);
    expect(profitSplit.updatedBy).toBeNull();
  });
});
