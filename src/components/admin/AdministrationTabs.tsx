import Link from "next/link";

const TABS = [
  { label: "Users", href: "/users" },
  { label: "Parties", href: "/parties" },
  { label: "Expense Items", href: "/expense-items" },
  { label: "Expense Categories", href: "/expense-categories" },
  { label: "Vendors", href: "/vendors" },
  { label: "Profit Split", href: "/profit-split" },
  { label: "Historical Import", href: "/import" },
] as const;

/**
 * The Stitch Administration Area's tab pattern (docs/ui/stitch-export/
 * administration_cdc_laboratories_code.html) — an in-page secondary nav
 * for moving between Administration screens once inside one. Each of
 * these routes also has its own direct sidebar link under the
 * "Administration" section (src/lib/navigation/nav-items.ts) so an Admin
 * never has to land on one Administration page before reaching another.
 * Every tab's own route independently calls `requirePermission`
 * (guard.ts) regardless of how it was reached — direct navigation to any
 * of these routes is denied server-side for a non-Admin, not just hidden
 * here or in the sidebar.
 */
export function AdministrationTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <div className="border-outline-variant mb-6 flex gap-6 overflow-x-auto border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={
            tab.href === active
              ? "text-primary border-primary min-h-touch-target-min border-b-2 px-1 pb-3 text-sm font-bold whitespace-nowrap"
              : "text-on-surface-variant hover:text-primary min-h-touch-target-min px-1 pb-3 text-sm whitespace-nowrap transition-colors"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
