import type { Role } from "../../../generated/prisma/enums";

export type { Role };

/**
 * OPERATOR ⊂ PARTNER ⊂ ADMIN (SRS §2.6, FR-AUTH-03, CLAUDE.md §15). A
 * PARTNER can do everything an OPERATOR can; an ADMIN can do everything a
 * PARTNER can. Expressed as a rank so `hasAtLeastRole` is a single
 * comparison, not a duplicated allow-list per role.
 */
const ROLE_RANK: Record<Role, number> = {
  OPERATOR: 0,
  PARTNER: 1,
  ADMIN: 2,
};

export function hasAtLeastRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
