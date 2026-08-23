import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { Prisma } from "../../../generated/prisma/client";

const prisma = getTestPrismaClient();

/**
 * Mandatory correction #5: `app_settings_profit_split_valid` CHECK enforces
 * non-null, in-range, and exactly-summing-to-100 split percentages at the
 * database level for the `profit_split` row specifically — every other
 * `app_settings` row is untouched by this CHECK (it only fires when
 * setting_key = 'profit_split').
 */
describe("app_settings_profit_split_valid CHECK constraint (FR-MST-06)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("accepts a valid profit_split row summing to exactly 100", async () => {
    const created = await prisma.appSetting.create({
      data: {
        settingKey: "profit_split",
        settingValue: {},
        splitAPercent: new Prisma.Decimal(60),
        splitBPercent: new Prisma.Decimal(40),
        updatedAt: new Date(),
      },
    });
    expect(created.splitAPercent?.toString()).toBe("60");
  });

  it("rejects a profit_split row with null percentages", async () => {
    await expect(
      prisma.appSetting.create({
        data: { settingKey: "profit_split", settingValue: {}, updatedAt: new Date() },
      }),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("rejects a profit_split row summing to something other than 100", async () => {
    await expect(
      prisma.appSetting.create({
        data: {
          settingKey: "profit_split",
          settingValue: {},
          splitAPercent: new Prisma.Decimal(60),
          splitBPercent: new Prisma.Decimal(50),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("rejects a negative percentage", async () => {
    await expect(
      prisma.appSetting.create({
        data: {
          settingKey: "profit_split",
          settingValue: {},
          splitAPercent: new Prisma.Decimal(-10),
          splitBPercent: new Prisma.Decimal(110),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("rejects a percentage over 100", async () => {
    await expect(
      prisma.appSetting.create({
        data: {
          settingKey: "profit_split",
          settingValue: {},
          splitAPercent: new Prisma.Decimal(150),
          splitBPercent: new Prisma.Decimal(-50),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("does not constrain a non-profit_split app_settings row with null percentages", async () => {
    const created = await prisma.appSetting.create({
      data: { settingKey: "some_other_setting", settingValue: { a: 1 }, updatedAt: new Date() },
    });
    expect(created.splitAPercent).toBeNull();
  });
});
