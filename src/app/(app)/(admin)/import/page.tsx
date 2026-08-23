import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { AdministrationTabs } from "../../../../components/admin/AdministrationTabs";
import { ImportWorkspace } from "../../../../components/admin/ImportWorkspace";

/** FR-IMP-01 to 04. */
export default async function ImportPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "historical-import:run");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  return (
    <div>
      <h1 className="text-on-surface mb-1 text-2xl font-semibold">Administration Area</h1>
      <p className="text-on-surface-variant mb-4 text-sm">
        Manage system settings, users, and data imports.
      </p>
      <AdministrationTabs active="/import" />
      <ImportWorkspace />
    </div>
  );
}
