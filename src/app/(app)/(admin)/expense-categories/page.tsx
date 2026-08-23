import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { prisma } from "../../../../server/prisma";
import { AdministrationTabs } from "../../../../components/admin/AdministrationTabs";
import { ExpenseCategoryManager } from "../../../../components/admin/ExpenseCategoryManager";

/** FR-MST-03. */
export default async function ExpenseCategoriesPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "master-data:manage");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-on-surface mb-1 text-2xl font-semibold">Administration Area</h1>
      <p className="text-on-surface-variant mb-4 text-sm">
        Manage system settings, users, and data imports.
      </p>
      <AdministrationTabs active="/expense-categories" />
      <ExpenseCategoryManager
        rows={categories.map((c) => ({
          id: c.id,
          name: c.name,
          isActive: c.isActive,
          updatedAt: c.updatedAt?.toISOString() ?? null,
          extraLabel: `${c.expenseGroup === "ADMIN" ? "Administration" : "Purchasing"}${c.isRecurring ? " · Recurring" : ""}`,
          extra: { expenseGroup: c.expenseGroup, isRecurring: c.isRecurring },
        }))}
      />
    </div>
  );
}
