"use client";

import type { NavItem } from "../../lib/navigation/nav-items";
import { TopNavBar } from "./TopNavBar";
import { OfflineProvider } from "../offline/OfflineProvider";

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: "Operator",
  PARTNER: "Partner",
  ADMIN: "Admin",
};

/**
 * Client-side shell chrome: single sticky top navigation bar that combines
 * the brand, section dropdowns, and user menu. The old fixed sidebar and
 * mobile hamburger drawer are removed — navigation lives entirely in the
 * top bar, with a mobile sheet drawer for small screens.
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
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <OfflineProvider userId={userId}>
      <div className="bg-background min-h-screen flex flex-col">
        <TopNavBar navItems={navItems} fullName={fullName} roleLabel={roleLabel} />
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1440px] flex-1 p-gutter md:p-container-margin"
        >
          {children}
        </main>
      </div>
    </OfflineProvider>
  );
}
