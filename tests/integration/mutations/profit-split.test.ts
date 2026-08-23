import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import { PermissionDeniedError, type AuthenticatedUser } from "../../../src/lib/permissions/guard";
import { updateProfitSplit } from "../../../src/server/mutations/app-settings";

const prisma = getTestPrismaClient();

function asUser(user: {
  id: string;
  role: "OPERATOR" | "PARTNER" | "ADMIN";
  isPartner: boolean;
}): AuthenticatedUser {
  return { id: user.id, role: user.role, isPartner: user.isPartner, isActive: true };
}

/**
 * Mandatory correction #5: the server recomputes the sum itself via
 * `Decimal` and never touches partnerAUserId/partnerBUserId — proven here
 * against a real database, backed by the app_settings_profit_split_valid
 * CHECK as final authority (tests/integration/constraints/profit-split-check.test.ts).
 */
describe("updateProfitSplit (FR-MST-06, Admin-only)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("denies a Partner from changing the split", async () => {
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });
    await expect(
      updateProfitSplit(prisma, asUser(partner), { splitAPercent: "60", splitBPercent: "40" }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("rejects percentages that do not sum to 100", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const result = await updateProfitSplit(prisma, asUser(admin), {
      splitAPercent: "60",
      splitBPercent: "50",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a percentage outside [0, 100]", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const result = await updateProfitSplit(prisma, asUser(admin), {
      splitAPercent: "150",
      splitBPercent: "-50",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a valid split, updates the row, and never touches partner mapping fields", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const partnerA = await createTestUser({ isPartner: true });
    const partnerB = await createTestUser({ isPartner: true });
    await prisma.appSetting.create({
      data: {
        settingKey: "profit_split",
        settingValue: {},
        splitAPercent: "50",
        splitBPercent: "50",
        partnerAUserId: partnerA.id,
        partnerBUserId: partnerB.id,
        updatedBy: admin.id,
        updatedAt: new Date(),
      },
    });

    const result = await updateProfitSplit(prisma, asUser(admin), {
      splitAPercent: "60",
      splitBPercent: "40",
    });
    expect(result.ok).toBe(true);

    const row = await prisma.appSetting.findUniqueOrThrow({
      where: { settingKey: "profit_split" },
    });
    expect(row.splitAPercent?.toNumber()).toBe(60);
    expect(row.splitBPercent?.toNumber()).toBe(40);
    expect(row.partnerAUserId).toBe(partnerA.id);
    expect(row.partnerBUserId).toBe(partnerB.id);
  });

  it("writes an audit row for the change", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await updateProfitSplit(prisma, asUser(admin), { splitAPercent: "70", splitBPercent: "30" });
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "app_setting", entityId: "profit_split", action: "UPDATE" },
    });
    expect(audit).not.toBeNull();
  });
});
