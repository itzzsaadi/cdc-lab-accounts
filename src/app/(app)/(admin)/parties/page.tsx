import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { prisma } from "../../../../server/prisma";
import { AdministrationTabs } from "../../../../components/admin/AdministrationTabs";
import { PartyManager } from "../../../../components/admin/PartyManager";

/** FR-MST-01. */
export default async function PartiesPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "master-data:manage");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const parties = await prisma.party.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div>
      <h1 className="text-on-surface mb-1 text-2xl font-semibold">Administration Area</h1>
      <p className="text-on-surface-variant mb-4 text-sm">
        Manage system settings, users, and data imports.
      </p>
      <AdministrationTabs active="/parties" />
      <PartyManager
        rows={parties.map((p) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
          updatedAt: p.updatedAt?.toISOString() ?? null,
          extraLabel: `${p.billingMode === "DAILY" ? "Daily" : "Monthly"} · #${p.sortOrder}`,
          extra: { billingMode: p.billingMode, sortOrder: p.sortOrder },
        }))}
      />
    </div>
  );
}
