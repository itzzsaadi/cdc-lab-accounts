import { hasAtLeastRole, type Role } from "../permissions/roles";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  minRole: Role;
}

/**
 * Incremental navigation (approved Phase 3A decision): only routes that
 * actually exist are listed. No dead links, no fake destinations. Each
 * later phase appends its own new screen's entry here when that screen is
 * actually built — this list is not pre-populated against
 * docs/UI_REQUIREMENTS.md §8's full target table ahead of time.
 *
 * This is presentational filtering only (`visibleNavItems`, reusing the
 * same `hasAtLeastRole` rank comparison `src/lib/permissions/guard.ts`
 * uses) — it never grants access. Every destination page independently
 * calls `requirePermission` itself; hiding a link here is never the actual
 * enforcement (CLAUDE.md §15/§16).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/home", icon: "home", minRole: "OPERATOR" },
  { label: "Dashboard", href: "/dashboard", icon: "dashboard", minRole: "PARTNER" },
  { label: "Users", href: "/users", icon: "manage_accounts", minRole: "ADMIN" },
];

export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => hasAtLeastRole(role, item.minRole));
}

/** The header's contextual title — the current nav item's own label, so it never drifts from the sidebar's wording. Falls back to the product name for a route with no nav entry (e.g. a future screen reached only via a quick action, not the sidebar). */
export function titleForPath(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.label ?? "CDC Lab Accounts System";
}
