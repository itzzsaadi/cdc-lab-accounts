"use client";

import { useEffect, useRef, useState } from "react";
import type { NavItem } from "../../lib/navigation/nav-items";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { OfflineProvider } from "../offline/OfflineProvider";

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: "Operator",
  PARTNER: "Partner",
  ADMIN: "Admin",
};

/**
 * Client-side shell chrome: fixed desktop sidebar, mobile hamburger
 * drawer (native <dialog> — Escape-to-close, focus-trap, and focus return
 * to the hamburger button all come from `showModal()` for free), and the
 * header. `children` (each page) stays server-rendered; only this chrome
 * needs client interactivity.
 */
export function ShellChrome({
  navItems,
  fullName,
  role,
  userId,
  children,
}: {
  navItems: NavItem[];
  fullName: string;
  role: string;
  userId: string;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <OfflineProvider userId={userId}>
      <div className="bg-background min-h-screen">
        {/* Desktop fixed sidebar */}
        <nav
          aria-label="Primary"
          className="bg-on-background w-sidebar-width fixed top-0 left-0 hidden h-screen flex-col px-4 py-4 md:flex"
        >
          <SidebarBrand />
          <Sidebar navItems={navItems} />
        </nav>

        {/* Mobile drawer — a genuinely modal native <dialog>, anchored left */}
        <dialog
          ref={dialogRef}
          onClose={() => setDrawerOpen(false)}
          onCancel={() => setDrawerOpen(false)}
          onClick={(event) => {
            if (event.target === dialogRef.current) setDrawerOpen(false);
          }}
          aria-label="Navigation menu"
          className="bg-on-background m-0 h-screen max-h-screen w-72 max-w-[80vw] px-4 py-4 backdrop:bg-black/40 open:flex open:flex-col"
          style={{ left: 0, top: 0 }}
        >
          <SidebarBrand />
          <Sidebar navItems={navItems} onNavigate={() => setDrawerOpen(false)} />
        </dialog>

        <div className="flex min-h-screen flex-col md:ml-sidebar-width">
          <Header fullName={fullName} roleLabel={roleLabel} onMenuClick={() => setDrawerOpen(true)} />
          <main
            id="main-content"
            className="max-w-[1440px] flex-1 p-gutter md:p-container-margin w-full mx-auto"
          >
            {children}
          </main>
        </div>
      </div>
    </OfflineProvider>
  );
}

function SidebarBrand() {
  return (
    <div className="mb-8 flex items-center gap-3">
      <div className="bg-surface-container-highest flex h-8 w-8 items-center justify-center rounded">
        <span className="material-symbols-outlined text-primary" aria-hidden>
          biotech
        </span>
      </div>
      <div>
        <p className="text-headline-sm text-surface-bright font-semibold">
          CDC Lab Accounts System
        </p>
      </div>
    </div>
  );
}
