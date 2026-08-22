import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../server/session";
import { prisma } from "../../server/prisma";
import { visibleNavItems } from "../../lib/navigation/nav-items";
import { ShellChrome } from "./ShellChrome";

/**
 * The one place every `(app)` route shares its chrome from
 * (`src/app/(app)/layout.tsx`). Fetches the authenticated user once and
 * redirects to sign-in if absent — this is a convenience redirect, not the
 * authorization boundary itself; every page under `(app)` still calls
 * `requirePermission` independently (CLAUDE.md §15/§16), so hiding/showing
 * chrome here never becomes a second, competing enforcement path.
 */
export async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const headers = await nextHeaders();
  const user = await getAuthenticatedUser(headers);

  if (!user) {
    // A cookie that merely *looks* like a session (matching the same
    // substring test tests/e2e/auth.spec.ts already uses) but no longer
    // resolves to a live session is the one case worth a distinct message
    // ("your session expired") rather than a bare, silent bounce to sign-in
    // for someone who was never signed in at all.
    const hadSessionCookie = (headers.get("cookie") ?? "").toLowerCase().includes("session");
    redirect(hadSessionCookie ? "/sign-in?expired=1" : "/sign-in");
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true },
  });

  return (
    <ShellChrome
      navItems={visibleNavItems(user.role)}
      fullName={profile?.fullName ?? ""}
      role={user.role}
      userId={user.id}
    >
      {children}
    </ShellChrome>
  );
}
