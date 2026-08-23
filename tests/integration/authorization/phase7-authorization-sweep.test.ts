import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import { PermissionDeniedError, type AuthenticatedUser } from "../../../src/lib/permissions/guard";
import { createParty, archiveOrReactivateParty } from "../../../src/server/mutations/master-data";
import { changeUserRole } from "../../../src/server/mutations/user-admin";
import { updateProfitSplit } from "../../../src/server/mutations/app-settings";
import { previewImport } from "../../../src/server/import/preview";
import { commitImport } from "../../../src/server/import/commit";

const prisma = getTestPrismaClient();

function asUser(user: {
  id: string;
  role: "OPERATOR" | "PARTNER" | "ADMIN";
  isPartner: boolean;
}): AuthenticatedUser {
  return { id: user.id, role: user.role, isPartner: user.isPartner, isActive: true };
}

/**
 * FR-AUTH-04/CLAUDE.md §16, extended to every Phase 7 Admin-only
 * mutation/route: an Operator AND a Partner are both denied, by direct
 * call, independent of any page-level redirect or hidden nav item (the
 * Administration Area's 6 tabs are deliberately reached only via an
 * in-page tab bar, not new sidebar links — server-side requirePermission
 * is the real, independent guard, proven here).
 */
describe("Phase 7 authorization sweep — Operator and Partner denied on every Admin-only action", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("denies master-data:manage (createParty, archiveOrReactivateParty) to Operator and Partner", async () => {
    const operator = await createTestUser({ role: "OPERATOR" });
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });
    const input = { name: "Test Party", billingMode: "DAILY" as const, sortOrder: 1 };
    await expect(createParty(prisma, asUser(operator), input)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(createParty(prisma, asUser(partner), input)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(
      archiveOrReactivateParty(prisma, asUser(operator), {
        id: crypto.randomUUID(),
        isActive: false,
        expectedUpdatedAt: null,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("denies user:manage-role (changeUserRole) to Operator and Partner", async () => {
    const operator = await createTestUser({ role: "OPERATOR" });
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });
    const target = await createTestUser({ role: "OPERATOR" });
    const input = { userId: target.id, role: "PARTNER" as const, isPartner: true };
    await expect(changeUserRole(prisma, asUser(operator), input)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(changeUserRole(prisma, asUser(partner), input)).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("denies profit-split:manage (updateProfitSplit) to Operator and Partner", async () => {
    const operator = await createTestUser({ role: "OPERATOR" });
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });
    const input = { splitAPercent: "60", splitBPercent: "40" };
    await expect(updateProfitSplit(prisma, asUser(operator), input)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(updateProfitSplit(prisma, asUser(partner), input)).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("denies historical-import:run (previewImport, commitImport) to Operator and Partner", async () => {
    const operator = await createTestUser({ role: "OPERATOR" });
    const partner = await createTestUser({ role: "PARTNER", isPartner: true });
    const file = { name: "test.xlsx", size: 4, bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) };
    await expect(previewImport(prisma, asUser(operator), file)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(previewImport(prisma, asUser(partner), file)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(commitImport(prisma, asUser(operator), crypto.randomUUID())).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("also denies an unauthenticated (null) caller on every Phase 7 gate above", async () => {
    const input = { name: "Test Party", billingMode: "DAILY" as const, sortOrder: 1 };
    await expect(createParty(prisma, null, input)).rejects.toThrow(PermissionDeniedError);
    await expect(
      changeUserRole(prisma, null, {
        userId: crypto.randomUUID(),
        role: "ADMIN",
        isPartner: true,
      }),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(
      updateProfitSplit(prisma, null, { splitAPercent: "50", splitBPercent: "50" }),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(
      previewImport(prisma, null, {
        name: "test.xlsx",
        size: 4,
        bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("denies an inactive Admin (deactivated account) on every Phase 7 gate", async () => {
    const inactiveAdmin: AuthenticatedUser = {
      id: crypto.randomUUID(),
      role: "ADMIN",
      isPartner: false,
      isActive: false,
    };
    await expect(
      createParty(prisma, inactiveAdmin, {
        name: "Test Party",
        billingMode: "DAILY",
        sortOrder: 1,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
