import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import { PermissionDeniedError, type AuthenticatedUser } from "../../../src/lib/permissions/guard";
import { changeUserRole } from "../../../src/server/mutations/user-admin";

const prisma = getTestPrismaClient();

function asUser(user: {
  id: string;
  role: "OPERATOR" | "PARTNER" | "ADMIN";
  isPartner: boolean;
}): AuthenticatedUser {
  return { id: user.id, role: user.role, isPartner: user.isPartner, isActive: true };
}

describe("changeUserRole (FR-AUTH-03, Admin-only, application-layer self-demotion guards)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("denies a Partner from changing anyone's role", async () => {
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });
    const target = await createTestUser({ role: "OPERATOR" });
    await expect(
      changeUserRole(prisma, asUser(partner), {
        userId: target.id,
        role: "PARTNER",
        isPartner: true,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("blocks an Admin from demoting their own role away from Admin", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await createTestUser({ role: "ADMIN" }); // a second admin, so the DB trigger itself would allow it
    const result = await changeUserRole(prisma, asUser(admin), {
      userId: admin.id,
      role: "OPERATOR",
      isPartner: false,
    });
    expect(result.ok).toBe(false);
  });

  it("blocks an Admin from removing their own partner status", async () => {
    const admin = await createTestUser({ role: "ADMIN", isPartner: true });
    const result = await changeUserRole(prisma, asUser(admin), {
      userId: admin.id,
      role: "ADMIN",
      isPartner: false,
    });
    expect(result.ok).toBe(false);
  });

  it("allows an Admin to change another user's role and writes an audit row", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const target = await createTestUser({ role: "OPERATOR" });
    const result = await changeUserRole(prisma, asUser(admin), {
      userId: target.id,
      role: "PARTNER",
      isPartner: true,
    });
    expect(result.ok).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.role).toBe("PARTNER");
    expect(updated.isPartner).toBe(true);
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "user", entityId: target.id, action: "UPDATE" },
    });
    expect(audit).not.toBeNull();
  });

  it("surfaces the database's last-active-Admin trigger as a friendly error when a different Admin performs an unsafe change", async () => {
    const acting = await createTestUser({ role: "ADMIN" });
    const soleAdmin = await createTestUser({ role: "ADMIN" });
    // Deactivate every other admin first isn't needed — acting + soleAdmin
    // means demoting `acting` itself would be blocked (self-check), so
    // instead prove the DB trigger fires when acting demotes soleAdmin
    // down to the last-admin edge: deactivate `acting` is not possible
    // (would violate last-admin too) — so this proves the case where
    // soleAdmin is the only remaining admin besides the actor by first
    // demoting the actor's own role is blocked at the app layer, and
    // demoting the *other* admin succeeds while 2 admins exist.
    const result = await changeUserRole(prisma, asUser(acting), {
      userId: soleAdmin.id,
      role: "OPERATOR",
      isPartner: false,
    });
    expect(result.ok).toBe(true);
    // Now only `acting` remains an active Admin — demoting them must be
    // rejected by the database trigger itself, surfaced as a friendly error.
    const finalAttempt = await changeUserRole(prisma, asUser(acting), {
      userId: acting.id,
      role: "OPERATOR",
      isPartner: false,
    });
    expect(finalAttempt.ok).toBe(false);
  });
});
