import type { Role } from "./roles";

/**
 * The single, centralized permission table (Phase 2 plan §10). Every
 * future functional area the SRS defines gets a key here so later phases
 * plug into this table rather than re-deriving authorization decisions.
 * `minimumRole` is checked via role inheritance (roles.ts) — PARTNER
 * satisfies anything OPERATOR satisfies, ADMIN satisfies anything PARTNER
 * satisfies.
 */
export const PERMISSIONS = {
  "entry:daily-expense": { minimumRole: "OPERATOR" },
  "entry:party-income": { minimumRole: "OPERATOR" },
  "entry:counter-income": { minimumRole: "OPERATOR" },
  "entry:cash-receipt": { minimumRole: "OPERATOR" },
  "offline:sync-center": { minimumRole: "OPERATOR" },
  "party-income:monthly-bill": { minimumRole: "PARTNER" },
  "monthly-expense:manage": { minimumRole: "PARTNER" },
  "asset:manage": { minimumRole: "PARTNER" },
  "report:financial-summary": { minimumRole: "PARTNER" },
  "report:dashboard": { minimumRole: "PARTNER" },
  "investment:view": { minimumRole: "PARTNER" },
  "investment:manage": { minimumRole: "PARTNER" },
  "audit-log:view": { minimumRole: "PARTNER" },
  "master-data:manage": { minimumRole: "ADMIN" },
  "profit-split:manage": { minimumRole: "ADMIN" },
  "user:invite": { minimumRole: "ADMIN" },
  "user:manage-role": { minimumRole: "ADMIN" },
  "user:deactivate": { minimumRole: "ADMIN" },
  "historical-import:run": { minimumRole: "ADMIN" },
} as const satisfies Record<string, { minimumRole: Role }>;

export type PermissionKey = keyof typeof PERMISSIONS;
