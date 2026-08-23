import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { changeUserRoleSchema } from "../../../src/lib/validation/auth";

describe("changeUserRoleSchema (Phase 7, FR-AUTH-03 — role and partner-flag edited together)", () => {
  it("accepts a valid role change", () => {
    expect(
      changeUserRoleSchema.safeParse({ userId: randomUUID(), role: "PARTNER", isPartner: true })
        .success,
    ).toBe(true);
  });

  it("accepts every valid role", () => {
    for (const role of ["OPERATOR", "PARTNER", "ADMIN"]) {
      expect(
        changeUserRoleSchema.safeParse({ userId: randomUUID(), role, isPartner: false }).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown role", () => {
    expect(
      changeUserRoleSchema.safeParse({ userId: randomUUID(), role: "SUPERADMIN", isPartner: false })
        .success,
    ).toBe(false);
  });

  it("rejects a non-UUID userId", () => {
    expect(
      changeUserRoleSchema.safeParse({ userId: "not-a-uuid", role: "ADMIN", isPartner: true })
        .success,
    ).toBe(false);
  });

  it("rejects a missing isPartner", () => {
    expect(changeUserRoleSchema.safeParse({ userId: randomUUID(), role: "ADMIN" }).success).toBe(
      false,
    );
  });
});
