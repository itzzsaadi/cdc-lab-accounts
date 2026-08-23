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
 * administration_cdc_laboratories_code.html) — reached only through the
 * single "Users" sidebar entry (CLAUDE.md/shell tests fix that exact
 * label and count), never as seven separate sidebar links. Every tab's
 * own route independently calls `requirePermission` (guard.ts) regardless
 * of this being reachable only from an Admin-visible entry point — direct
 * navigation to any of these routes is denied server-side for a
 * non-Admin, not just hidden here.
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
