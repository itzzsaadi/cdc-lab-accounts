import { hasAtLeastRole, type Role } from "./roles";
import { PERMISSIONS, type PermissionKey } from "./matrix";

/**
 * The one shape every Server Component, Server Action, and Route Handler
 * checks against (Phase 2 plan §10). Deliberately holds only what an
 * authorization decision needs — never a raw Better Auth session object —
 * so this module has no dependency on the concrete auth instance and stays
 * unit-testable in isolation (tests/unit/permissions/guard.test.ts).
 */
export interface AuthenticatedUser {
  id: string;
  role: Role;
  isPartner: boolean;
  isActive: boolean;
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

/**
 * Throws if there is no user, the account is inactive, or the role lacks
 * the permission — otherwise returns the user, so callers can chain
 * `const user = requirePermission(current, "user:invite")`. Called
 * identically from a Server Component's top of render, a Server Action's
 * first line, and a Route Handler's first line (Phase 2 plan §10) — never
 * a second, different check.
 */
export function requirePermission(
  user: AuthenticatedUser | null,
  key: PermissionKey,
): AuthenticatedUser {
  if (!user) {
    throw new PermissionDeniedError("Not authenticated.");
  }
  if (!user.isActive) {
    throw new PermissionDeniedError("Account is not active.");
  }
  const { minimumRole } = PERMISSIONS[key];
  if (!hasAtLeastRole(user.role, minimumRole)) {
    throw new PermissionDeniedError(`Role ${user.role} does not have permission "${key}".`);
  }
  return user;
}
