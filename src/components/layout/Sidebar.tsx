"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "../../lib/navigation/nav-items";

/**
 * The link list shared by the fixed desktop sidebar and the mobile drawer
 * (docs/ui/stitch-export/operator_home_cdc_laboratories_code.html's
 * SideNavBar structure/styling — active-tab left border, icon + label).
 * `navItems` is already role-filtered by the caller (`visibleNavItems`) —
 * this component only renders what it's given, it never itself decides
 * what a role may see.
 */
export function Sidebar({
  navItems,
  onNavigate,
}: {
  navItems: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-2">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-touch-target-min items-center gap-3 rounded-r px-3 py-3 transition-colors duration-200 ${
              active
                ? "border-primary-fixed-dim bg-secondary-container/10 text-primary-fixed-dim border-l-2 font-bold"
                : "border-l-2 border-transparent text-on-secondary-fixed-variant hover:bg-on-secondary-fixed-variant hover:text-surface-bright"
            }`}
          >
            <span className="material-symbols-outlined" aria-hidden>
              {item.icon}
            </span>
            <span className="text-body-md">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
