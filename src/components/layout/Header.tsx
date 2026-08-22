"use client";

import { usePathname } from "next/navigation";
import { titleForPath } from "../../lib/navigation/nav-items";
import { UserMenu } from "./UserMenu";
import { SyncStatusIndicator } from "../offline/SyncStatusIndicator";

/**
 * Header: mobile menu control, contextual application title, the FR-OFF-03
 * connection/pending-count indicator (Phase 6), user menu, sign-out.
 */
export function Header({
  fullName,
  roleLabel,
  onMenuClick,
}: {
  fullName: string;
  roleLabel: string;
  onMenuClick: () => void;
}) {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="h-header-height border-outline-variant bg-surface sticky top-0 z-40 flex w-full items-center justify-between border-b px-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="min-h-touch-target-min min-w-touch-target-min text-on-surface-variant flex items-center justify-center md:hidden"
        >
          <span className="material-symbols-outlined" aria-hidden>
            menu
          </span>
        </button>
        <span className="text-headline-sm text-on-surface font-semibold">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <SyncStatusIndicator />
        <UserMenu fullName={fullName} roleLabel={roleLabel} />
      </div>
    </header>
  );
}
