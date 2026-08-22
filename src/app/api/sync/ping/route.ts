import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";

/**
 * CLAUDE.md Phase 6 mandatory decision #2: proof of a genuinely
 * authenticated, usable connection — deliberately a distinct endpoint from
 * the public `/api/health` route (which proves only that the server is
 * reachable, not that this specific session is still valid). The sync
 * engine calls this with a 3-second client-side timeout and one retry
 * before treating a reconnect as "verified" and starting a sync attempt;
 * bare `navigator.onLine` is never trusted for that decision. `HEAD` only —
 * no body is needed or returned; a 200 means "authenticated and active", a
 * 401/403 means the session/account can no longer sync.
 */
export async function HEAD() {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(currentUser, "offline:sync-center");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return new NextResponse(null, { status: 401 });
    }
    throw error;
  }
  return new NextResponse(null, { status: 200 });
}
