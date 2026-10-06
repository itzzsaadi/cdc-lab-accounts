"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { groupNavItems, type NavItem } from "../../lib/navigation/nav-items";

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Short display labels for section headings in the nav bar */
const SECTION_SHORT_LABELS: Record<string, string> = {
  overview: "Overview",
  "daily-operations": "Daily",
  "monthly-operations": "Monthly",
  reports: "Reports",
  "offline-sync": "Sync",
  administration: "Admin",
};

function NavDropdown({
  sectionLabel,
  items,
  isAnySectionActive,
}: {
  sectionLabel: string;
  items: NavItem[];
  isAnySectionActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Find the currently active item in this section
  const activeItem = items.find((item) => isActiveHref(pathname, item.href));

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
          isAnySectionActive
            ? "bg-primary-fixed-dim/20 text-primary-fixed-dim"
            : "text-surface-bright/70 hover:bg-white/10 hover:text-surface-bright"
        }`}
      >
        {isAnySectionActive && activeItem ? activeItem.label : sectionLabel}
        <span
          className={`material-symbols-outlined text-[16px] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          expand_more
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="bg-on-background border-outline-variant absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-lg border py-1 shadow-lg"
        >
          {items
            .filter((item) => item !== activeItem)
            .map((item) => (
            <DropdownLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active = isActiveHref(pathname, item.href);

  return (
    <Link
      href={item.href}
      role="menuitem"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
        active
          ? "text-primary-fixed-dim bg-white/10 font-semibold"
          : "text-surface-bright/80 hover:bg-white/10 hover:text-surface-bright"
      }`}
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden>
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

/**
 * Top navigation bar: renders each nav section as a compact dropdown button.
 * Sections with a single item render as a direct link instead of a dropdown.
 */
export function TopNav({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  const groups = groupNavItems(navItems);

  return (
    <nav aria-label="Primary" className="flex items-center gap-0.5">
      {groups.map(({ section, items }) => {
        const isAnySectionActive = items.some((item) => isActiveHref(pathname, item.href));
        const shortLabel = SECTION_SHORT_LABELS[section.id] ?? section.label;

        // Single-item sections: render a direct link instead of a dropdown
        if (items.length === 1) {
          const item = items[0];
          const active = isActiveHref(pathname, item.href);
          return (
            <Link
              key={section.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-fixed-dim/20 text-primary-fixed-dim"
                  : "text-surface-bright/70 hover:bg-white/10 hover:text-surface-bright"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden>
                {item.icon}
              </span>
              {shortLabel}
            </Link>
          );
        }

        return (
          <NavDropdown
            key={section.id}
            sectionLabel={shortLabel}
            items={items}
            isAnySectionActive={isAnySectionActive}
          />
        );
      })}
    </nav>
  );
}
