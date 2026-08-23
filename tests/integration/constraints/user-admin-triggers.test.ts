import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

/**
 * Mandatory correction #3 — all three new `users` triggers
 * (phase7_administration_and_import migration), proven directly against
 * Postgres via a raw UPDATE, independent of any application-layer check in
 * server/mutations/user-admin.ts or server/actions/auth.ts (those are a
 * second, defense-in-depth layer, never the sole guarantee).
 */
describe("users_last_admin_protection (covers both deactivation AND role downgrade)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects deactivating the last active Admin", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await expect(
      prisma.user.update({ where: { id: admin.id }, data: { isActive: false } }),
    ).rejects.toThrow(/last active Admin/);
  });

  it("rejects demoting the last active Admin's role away from ADMIN", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await expect(
      prisma.user.update({ where: { id: admin.id }, data: { role: "PARTNER" } }),
    ).rejects.toThrow(/last active Admin/);
  });

  it("allows deactivating an Admin when another active Admin remains", async () => {
    const admin1 = await createTestUser({ role: "ADMIN" });
    await createTestUser({ role: "ADMIN" });
    const updated = await prisma.user.update({
      where: { id: admin1.id },
      data: { isActive: false },
    });
    expect(updated.isActive).toBe(false);
  });

  it("allows demoting an Admin's role when another active Admin remains", async () => {
    const admin1 = await createTestUser({ role: "ADMIN" });
    await createTestUser({ role: "ADMIN" });
    const updated = await prisma.user.update({
      where: { id: admin1.id },
      data: { role: "OPERATOR" },
    });
    expect(updated.role).toBe("OPERATOR");
  });

  it("does not block an unrelated update to the last Admin (e.g. renaming)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const updated = await prisma.user.update({
      where: { id: admin.id },
      data: { fullName: "Renamed Admin" },
    });
    expect(updated.fullName).toBe("Renamed Admin");
  });

  it("does not block demoting a second already-inactive Admin (does not count toward 'remaining')", async () => {
    const activeAdmin = await createTestUser({ role: "ADMIN" });
    const inactiveAdmin = await prisma.user.create({
      data: {
        fullName: "Inactive Admin",
        email: `inactive-${crypto.randomUUID()}@example.test`,
        role: "ADMIN",
        isActive: false,
      },
    });
    // Sanity: only one active admin exists (activeAdmin) — demoting it must still fail.
    await expect(
      prisma.user.update({ where: { id: activeAdmin.id }, data: { role: "OPERATOR" } }),
    ).rejects.toThrow(/last active Admin/);
    // The inactive admin itself can be freely updated (it's not "the last active Admin").
    const updated = await prisma.user.update({
      where: { id: inactiveAdmin.id },
      data: { role: "OPERATOR" },
    });
    expect(updated.role).toBe("OPERATOR");
  });
});

describe("users_partner_flag_removal_guard (mirrors reject_if_not_partner)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects removing partner status from a user mapped as Partner A or B", async () => {
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
    await expect(
      prisma.user.update({ where: { id: partnerA.id }, data: { isPartner: false } }),
    ).rejects.toThrow(/configured as Partner A or B/);
  });

  it("allows removing partner status from a partner who is not mapped", async () => {
    const partner = await createTestUser({ isPartner: true });
    const updated = await prisma.user.update({
      where: { id: partner.id },
      data: { isPartner: false },
    });
    expect(updated.isPartner).toBe(false);
  });
});

describe("users_revoke_sessions_on_authorization_change (AFTER UPDATE, generic to role/partner/active changes)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function createSessionFor(userId: string) {
    return prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  it("revokes existing sessions when role changes", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await createTestUser({ role: "ADMIN" }); // keep at least 2 admins so the demotion itself isn't blocked
    const operator = await createTestUser({ role: "OPERATOR" });
    await createSessionFor(operator.id);
    await prisma.user.update({ where: { id: operator.id }, data: { role: "PARTNER" } });
    expect(await prisma.session.count({ where: { userId: operator.id } })).toBe(0);
    void admin;
  });

  it("revokes existing sessions when is_active changes", async () => {
    const admin1 = await createTestUser({ role: "ADMIN" });
    await createTestUser({ role: "ADMIN" });
    await createSessionFor(admin1.id);
    await prisma.user.update({ where: { id: admin1.id }, data: { isActive: false } });
    expect(await prisma.session.count({ where: { userId: admin1.id } })).toBe(0);
  });

  it("revokes existing sessions when is_partner changes", async () => {
    const user = await createTestUser({ isPartner: false });
    await createSessionFor(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { isPartner: true } });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("does not revoke sessions for an unrelated field change", async () => {
    const user = await createTestUser();
    await createSessionFor(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { fullName: "New Name" } });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });
});
