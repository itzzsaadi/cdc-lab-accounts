"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NavItem } from "../../lib/navigation/nav-items";
import { UserMenu } from "./UserMenu";
import { SyncStatusIndicator } from "../offline/SyncStatusIndicator";
import { TopNav } from "./TopNav";
import { Sidebar } from "./Sidebar";

/**
 * Single sticky top bar: brand mark → nav dropdowns → spacer → sync → user menu.
 * On mobile (< md) the nav dropdowns are hidden; a hamburger opens a native
 * <dialog> drawer with the full Sidebar for touch-friendly access.
 */
export function TopNavBar({
  navItems,
  fullName,
  roleLabel,
}: {
  navItems: NavItem[];
  fullName: string;
  roleLabel: string;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="bg-on-background border-outline-variant sticky top-0 z-40 flex h-14 w-full items-center gap-4 border-b px-4">
        {/* Brand */}
        <Link
          href="/home"
          className="flex shrink-0 items-center gap-2 text-surface-bright"
          aria-label="CDC Lab Accounts — home"
        >
          <div className="bg-surface-container-highest flex h-7 w-7 items-center justify-center rounded">
            <span className="material-symbols-outlined text-primary text-[18px]" aria-hidden>
              biotech
            </span>
          </div>
          <span className="text-sm font-semibold leading-tight hidden sm:block">
            CDC Lab
          </span>
        </Link>

        {/* Divider */}
        <div className="bg-outline-variant hidden h-5 w-px md:block" aria-hidden />

        {/* Nav dropdowns — desktop only */}
        <div className="hidden min-w-0 flex-1 md:flex items-center">
          <TopNav navItems={navItems} />
        </div>

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SyncStatusIndicator />
          <UserMenu fullName={fullName} roleLabel={roleLabel} />
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          className="text-surface-bright/70 hover:text-surface-bright flex items-center justify-center md:hidden"
        >
          <span className="material-symbols-outlined" aria-hidden>
            menu
          </span>
        </button>
      </header>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        onClose={() => setDrawerOpen(false)}
        onCancel={() => setDrawerOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setDrawerOpen(false);
        }}
        aria-label="Navigation menu"
        className="bg-on-background m-0 h-screen max-h-screen w-72 max-w-[80vw] px-4 py-4 backdrop:bg-black/40 open:flex open:flex-col overflow-hidden"
        style={{ left: 0, top: 0 }}
      >
        {/* Drawer brand */}
        <div className="mb-6 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-surface-container-highest flex h-8 w-8 items-center justify-center rounded">
              <span className="material-symbols-outlined text-primary" aria-hidden>
                biotech
              </span>
            </div>
            <p className="text-headline-sm text-surface-bright font-semibold">CDC Lab</p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="text-surface-bright/70 hover:text-surface-bright"
          >
            <span className="material-symbols-outlined" aria-hidden>
              close
            </span>
          </button>
        </div>
        <Sidebar navItems={navItems} onNavigate={() => setDrawerOpen(false)} />
      </dialog>
    </>
  );
}
