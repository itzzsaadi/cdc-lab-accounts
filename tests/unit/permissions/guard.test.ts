import { describe, expect, it } from "vitest";
import { requirePermission, PermissionDeniedError } from "../../../src/lib/permissions/guard";

describe("requirePermission", () => {
  it("denies when there is no authenticated user", () => {
    expect(() => requirePermission(null, "entry:daily-expense")).toThrow(PermissionDeniedError);
  });

  it("denies a deactivated user even with the right role", () => {
    const user = { id: "1", role: "ADMIN" as const, isPartner: true, isActive: false };
    expect(() => requirePermission(user, "user:invite")).toThrow(PermissionDeniedError);
  });

  it("allows an Operator to reach Operator-level permissions", () => {
    const user = { id: "1", role: "OPERATOR" as const, isPartner: false, isActive: true };
    expect(requirePermission(user, "entry:daily-expense")).toBe(user);
  });

  it("denies an Operator from a Partner-only permission", () => {
    const user = { id: "1", role: "OPERATOR" as const, isPartner: false, isActive: true };
    expect(() => requirePermission(user, "report:dashboard")).toThrow(PermissionDeniedError);
  });

  it("denies a Partner from an Admin-only permission", () => {
    const user = { id: "1", role: "PARTNER" as const, isPartner: true, isActive: true };
    expect(() => requirePermission(user, "user:invite")).toThrow(PermissionDeniedError);
  });

  it("allows an Admin to reach every permission via role inheritance", () => {
    const user = { id: "1", role: "ADMIN" as const, isPartner: true, isActive: true };
    expect(requirePermission(user, "entry:daily-expense")).toBe(user);
    expect(requirePermission(user, "report:dashboard")).toBe(user);
    expect(requirePermission(user, "user:invite")).toBe(user);
  });
});
