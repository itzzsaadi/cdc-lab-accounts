import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { prisma } from "../../../../server/prisma";
import { getAuthenticatedUser } from "../../../../server/session";
import { PermissionDeniedError } from "../../../../lib/permissions/guard";
import { getOfflineReferenceSnapshot } from "../../../../server/queries/offline";

/** FR-OFF reference-data cache refresh — called on sign-in and after every
 * successful sync (src/lib/offline/reference-cache.ts). */
export async function GET() {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  try {
    const snapshot = await getOfflineReferenceSnapshot(prisma, currentUser);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    throw error;
  }
}
