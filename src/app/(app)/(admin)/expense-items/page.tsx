import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { prisma } from "../../../../server/prisma";
import { AdministrationTabs } from "../../../../components/admin/AdministrationTabs";
import { ExpenseItemManager } from "../../../../components/admin/ExpenseItemManager";

/** FR-MST-02. */
export default async function ExpenseItemsPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "master-data:manage");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const items = await prisma.expenseItem.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-on-surface mb-1 text-2xl font-semibold">Administration Area</h1>
      <p className="text-on-surface-variant mb-4 text-sm">
        Manage system settings, users, and data imports.
      </p>
      <AdministrationTabs active="/expense-items" />
      <ExpenseItemManager
        rows={items.map((i) => ({
          id: i.id,
          name: i.name,
          isActive: i.isActive,
          updatedAt: i.updatedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
