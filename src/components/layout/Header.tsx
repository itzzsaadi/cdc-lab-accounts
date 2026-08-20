"use client";

import { usePathname } from "next/navigation";
import { titleForPath } from "../../lib/navigation/nav-items";
import { UserMenu } from "./UserMenu";

/**
 * Approved Phase 3A header: mobile menu control, contextual application
 * title, initials avatar, role label, user menu, sign-out. No
 * notification bell and no sync indicator — both would imply a feature
 * that doesn't exist yet (the sync indicator gets real state in Phase 6).
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
      <UserMenu fullName={fullName} roleLabel={roleLabel} />
    </header>
  );
}
