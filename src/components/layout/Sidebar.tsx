"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { groupNavItems, type NavItem } from "../../lib/navigation/nav-items";

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The link list shared by the fixed desktop sidebar and the mobile drawer
 * (docs/ui/stitch-export/operator_home_cdc_laboratories_code.html's
 * SideNavBar structure/styling — active-tab left border, icon + label),
 * grouped under section headings (Overview, Daily Operations, Monthly
 * Operations, Reports, Offline and Sync, Administration). `navItems` is
 * already role-filtered by the caller (`visibleNavItems`) — this component
 * only renders what it's given, it never itself decides what a role may
 * see.
 */
export function Sidebar({
  navItems,
  onNavigate,
}: {
  navItems: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = groupNavItems(navItems);
  const activeSectionId = groups.find((group) =>
    group.items.some((item) => isActiveHref(pathname, item.href)),
  )?.section.id;

  // Administration is the only collapsible section (it's the one with
  // enough links to overcrowd the sidebar); every other section always
  // renders open. Expanded by default — every Admin-authorized route must
  // stay reachable without an extra click. A user may collapse it
  // manually, but that choice is overridden — computed at render, not via
  // a setState-in-effect — the moment navigation lands on a route inside
  // it, so the active route is never hidden behind a collapsed section.
  const [administrationManuallyCollapsed, setAdministrationManuallyCollapsed] = useState(false);

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-4 overflow-y-auto">
      {groups.map(({ section, items }) => {
        const collapsed =
          section.collapsible && administrationManuallyCollapsed && activeSectionId !== section.id;
        const panelId = `nav-section-${section.id}`;
        return (
          <div key={section.id}>
            {section.collapsible ? (
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-controls={panelId}
                onClick={() => setAdministrationManuallyCollapsed((prev) => !prev)}
                className="text-on-secondary-fixed-variant hover:text-surface-bright flex min-h-touch-target-min w-full items-center justify-between px-3 text-label-md font-semibold tracking-wide uppercase"
              >
                <span>{section.label}</span>
                <span className="material-symbols-outlined text-[20px]" aria-hidden>
                  {collapsed ? "expand_more" : "expand_less"}
                </span>
              </button>
            ) : (
              <h3 className="text-on-secondary-fixed-variant px-3 py-2 text-label-md font-semibold tracking-wide uppercase">
                {section.label}
              </h3>
            )}
            {!collapsed && (
              <div id={panelId} className="flex flex-col gap-1">
                {items.map((item) => {
                  const active = isActiveHref(pathname, item.href);
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
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
