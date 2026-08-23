import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { prisma } from "../../../../server/prisma";
import { AdministrationTabs } from "../../../../components/admin/AdministrationTabs";
import { VendorManager } from "../../../../components/admin/VendorManager";

/** FR-MST-04. */
export default async function VendorsPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "master-data:manage");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-on-surface mb-1 text-2xl font-semibold">Administration Area</h1>
      <p className="text-on-surface-variant mb-4 text-sm">
        Manage system settings, users, and data imports.
      </p>
      <AdministrationTabs active="/vendors" />
      <VendorManager
        rows={vendors.map((v) => ({
          id: v.id,
          name: v.name,
          isActive: v.isActive,
          updatedAt: v.updatedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
