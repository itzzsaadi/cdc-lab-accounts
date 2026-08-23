import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import { configurePartnerMapping } from "../../../src/server/mutations/app-settings";
import { getProfitSplitConfig } from "../../../src/server/queries/app-settings";
import { PermissionDeniedError } from "../../../src/lib/permissions/guard";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function adminUser() {
  const row = await createTestUser({ role: "ADMIN", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("configurePartnerMapping (FR-RES-08, approved decision — explicit FK, never account order)", () => {
  it("configures both partners together and is reflected in getProfitSplitConfig", async () => {
    const admin = await adminUser();
    const partnerA = await createTestUser({ isPartner: true });
    const partnerB = await createTestUser({ isPartner: true });

    const result = await configurePartnerMapping(prisma, admin, {
      partnerAUserId: partnerA.id,
      partnerBUserId: partnerB.id,
    });
    expect(result.ok).toBe(true);

    const config = await getProfitSplitConfig(prisma);
    expect(config.isConfigured).toBe(true);
    expect(config.partnerAUserId).toBe(partnerA.id);
    expect(config.partnerBUserId).toBe(partnerB.id);
  });

  it("is write-once — refuses to change an already-configured mapping", async () => {
    const admin = await adminUser();
    const partnerA = await createTestUser({ isPartner: true });
    const partnerB = await createTestUser({ isPartner: true });
    const partnerC = await createTestUser({ isPartner: true });

    await configurePartnerMapping(prisma, admin, {
      partnerAUserId: partnerA.id,
      partnerBUserId: partnerB.id,
    });
    const second = await configurePartnerMapping(prisma, admin, {
      partnerAUserId: partnerA.id,
      partnerBUserId: partnerC.id,
    });
    expect(second.ok).toBe(false);

    const config = await getProfitSplitConfig(prisma);
    expect(config.partnerBUserId).toBe(partnerB.id);
  });

  it("rejects identical Partner A and Partner B", async () => {
    const admin = await adminUser();
    const partnerA = await createTestUser({ isPartner: true });

    const result = await configurePartnerMapping(prisma, admin, {
      partnerAUserId: partnerA.id,
      partnerBUserId: partnerA.id,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-partner user via the reject_if_not_partner trigger", async () => {
    const admin = await adminUser();
    const partnerA = await createTestUser({ isPartner: true });
    const operator = await createTestUser({ isPartner: false });

    await expect(
      configurePartnerMapping(prisma, admin, {
        partnerAUserId: partnerA.id,
        partnerBUserId: operator.id,
      }),
    ).rejects.toThrow();
  });

  it("getProfitSplitConfig reports isConfigured=false and null names before any mapping is set", async () => {
    const config = await getProfitSplitConfig(prisma);
    expect(config.isConfigured).toBe(false);
    expect(config.partnerAUserId).toBeNull();
    expect(config.partnerAName).toBeNull();
  });
});

describe("app_settings partner mapping — DB constraints (migration 20260821181426)", () => {
  it("rejects a partial mapping (one set, one null) via direct write", async () => {
    const partnerA = await createTestUser({ isPartner: true });
    await prisma.appSetting.create({
      data: {
        settingKey: "profit_split",
        settingValue: {},
        splitAPercent: "50",
        splitBPercent: "50",
        updatedAt: new Date(),
      },
    });
    await expect(
      prisma.appSetting.update({
        where: { settingKey: "profit_split" },
        data: { partnerAUserId: partnerA.id, updatedAt: new Date() },
      }),
    ).rejects.toThrow();
  });

  it("deactivating a mapped partner never clears the mapping", async () => {
    const admin = await adminUser();
    const partnerA = await createTestUser({ isPartner: true });
    const partnerB = await createTestUser({ isPartner: true });
    await configurePartnerMapping(prisma, admin, {
      partnerAUserId: partnerA.id,
      partnerBUserId: partnerB.id,
    });

    await prisma.user.update({ where: { id: partnerA.id }, data: { isActive: false } });

    const config = await getProfitSplitConfig(prisma);
    expect(config.partnerAUserId).toBe(partnerA.id);
    expect(config.isConfigured).toBe(true);
  });

  it("denies an OPERATOR and a PARTNER (Admin-only, FR-AUTH-04/CLAUDE.md §16)", async () => {
    const partnerA = await createTestUser({ isPartner: true });
    const partnerB = await createTestUser({ isPartner: true });
    const operator = await createTestUser({ role: "OPERATOR", isPartner: false });
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });

    await expect(
      configurePartnerMapping(prisma, operator, {
        partnerAUserId: partnerA.id,
        partnerBUserId: partnerB.id,
      }),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(
      configurePartnerMapping(prisma, partner, {
        partnerAUserId: partnerA.id,
        partnerBUserId: partnerB.id,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
