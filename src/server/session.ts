import { auth } from "./auth";
import { prisma } from "./prisma";
import type { AuthenticatedUser } from "../lib/permissions/guard";

/**
 * Resolves the current caller into the minimal shape `requirePermission`
 * needs (Phase 2 plan §10). Always re-reads `role`/`isPartner`/`isActive`
 * fresh from `users` — never trusts the session-cookie payload for the
 * authorization decision itself, only for identity (the user id). This is
 * what makes a deactivation effective on a request's very next call, not
 * only at its next sign-in.
 */
export async function getAuthenticatedUser(headers: Headers): Promise<AuthenticatedUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isPartner: true, isActive: true },
  });
  if (!user) {
    return null;
  }
  return user;
}
