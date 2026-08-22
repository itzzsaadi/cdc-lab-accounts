import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { SyncCenter } from "../../../../components/offline/SyncCenter";

/** FR-OFF: the queue list, conflict resolution, and manual retry — all
 * client-side state (the offline queue lives in this browser's IndexedDB),
 * so the server side of this route is only the permission gate. */
export default async function SyncCenterPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "offline:sync-center");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-display-lg text-on-background font-bold">Sync Center</h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          Entries you&rsquo;ve made while offline, and their sync status.
        </p>
      </div>
      <SyncCenter />
    </div>
  );
}
