import { hasAtLeastRole, type Role } from "../permissions/roles";

export type NavSectionId =
  | "overview"
  | "daily-operations"
  | "monthly-operations"
  | "reports"
  | "offline-sync"
  | "administration";

export interface NavSection {
  id: NavSectionId;
  label: string;
  /** Only the Administration section is collapsible — it's the one group large enough to overcrowd the sidebar (FR-AUTH-03 gives it 8 possible links, every other section has at most 4). */
  collapsible?: boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  { id: "overview", label: "Overview" },
  { id: "daily-operations", label: "Daily Operations" },
  { id: "monthly-operations", label: "Monthly Operations" },
  { id: "reports", label: "Reports" },
  { id: "offline-sync", label: "Offline and Sync" },
  { id: "administration", label: "Administration", collapsible: true },
];

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  minRole: Role;
  section: NavSectionId;
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
 *
 * Every Administration page is now a real sidebar entry (superseding the
 * earlier Phase 7 decision to reach them only through the in-page
 * `AdministrationTabs` bar) — an Admin must never need to type a URL by
 * hand to reach any route they're authorized for.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/home", icon: "home", minRole: "OPERATOR", section: "overview" },
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
    minRole: "PARTNER",
    section: "overview",
  },

  {
    label: "Daily Expenses",
    href: "/daily-expenses",
    icon: "receipt_long",
    minRole: "OPERATOR",
    section: "daily-operations",
  },
  {
    label: "Party Income",
    href: "/party-income",
    icon: "groups",
    minRole: "OPERATOR",
    section: "daily-operations",
  },
  {
    label: "Counter Income",
    href: "/counter-income",
    icon: "point_of_sale",
    minRole: "OPERATOR",
    section: "daily-operations",
  },

  {
    label: "Monthly Expenses",
    href: "/monthly-expenses",
    icon: "receipt_long",
    minRole: "PARTNER",
    section: "monthly-operations",
  },
  {
    label: "Monthly Party Bills",
    href: "/party-income-monthly",
    icon: "request_quote",
    minRole: "PARTNER",
    section: "monthly-operations",
  },
  {
    label: "Asset Register",
    href: "/assets",
    icon: "inventory_2",
    minRole: "PARTNER",
    section: "monthly-operations",
  },
  {
    label: "Partner Investment",
    href: "/investment",
    icon: "handshake",
    minRole: "PARTNER",
    section: "monthly-operations",
  },

  {
    label: "Monthly Summary",
    href: "/monthly-summary",
    icon: "summarize",
    minRole: "PARTNER",
    section: "reports",
  },
  {
    label: "Income by Party",
    href: "/party-income-report",
    icon: "bar_chart",
    minRole: "PARTNER",
    section: "reports",
  },

  {
    label: "Sync Center",
    href: "/sync-center",
    icon: "sync",
    minRole: "OPERATOR",
    section: "offline-sync",
  },
  {
    label: "Offline Entry Workspace",
    href: "/offline-entry",
    icon: "wifi_off",
    minRole: "OPERATOR",
    section: "offline-sync",
  },

  {
    label: "Users",
    href: "/users",
    icon: "manage_accounts",
    minRole: "ADMIN",
    section: "administration",
  },
  {
    label: "Parties",
    href: "/parties",
    icon: "apartment",
    minRole: "ADMIN",
    section: "administration",
  },
  {
    label: "Expense Items",
    href: "/expense-items",
    icon: "sell",
    minRole: "ADMIN",
    section: "administration",
  },
  {
    label: "Expense Categories",
    href: "/expense-categories",
    icon: "category",
    minRole: "ADMIN",
    section: "administration",
  },
  {
    label: "Vendors",
    href: "/vendors",
    icon: "storefront",
    minRole: "ADMIN",
    section: "administration",
  },
  {
    label: "Profit Split",
    href: "/profit-split",
    icon: "pie_chart",
    minRole: "ADMIN",
    section: "administration",
  },
  {
    label: "Historical Import",
    href: "/import",
    icon: "upload_file",
    minRole: "ADMIN",
    section: "administration",
  },
  {
    label: "Audit Log",
    href: "/audit-log",
    icon: "history",
    minRole: "PARTNER",
    section: "administration",
  },
];

export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => hasAtLeastRole(role, item.minRole));
}

/** Groups an already role-filtered item list under `NAV_SECTIONS`, in that fixed order, dropping any section left with nothing to show. */
export function groupNavItems(items: NavItem[]): { section: NavSection; items: NavItem[] }[] {
  return NAV_SECTIONS.map((section) => ({
    section,
    items: items.filter((item) => item.section === section.id),
  })).filter((group) => group.items.length > 0);
}

/** The header's contextual title — the current nav item's own label, so it never drifts from the sidebar's wording. Falls back to the product name for a route with no nav entry (e.g. a future screen reached only via a quick action, not the sidebar). */
export function titleForPath(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.label ?? "CDC Lab Accounts System";
}
