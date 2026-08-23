import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { prisma } from "../../../../server/prisma";
import { AdministrationTabs } from "../../../../components/admin/AdministrationTabs";
import { UserManager } from "../../../../components/admin/UserManager";

/** FR-AUTH-03. The Administration Area's entry point — reached via the single "Users" sidebar link (nav-items.ts is unchanged); every other admin screen is a tab from here, never a separate sidebar entry. */
export default async function AdminUsersPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "user:invite");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isPartner: true,
      isActive: true,
      accounts: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <h1 className="text-on-surface mb-1 text-2xl font-semibold">Administration Area</h1>
      <p className="text-on-surface-variant mb-4 text-sm">
        Manage system settings, users, and data imports.
      </p>
      <AdministrationTabs active="/users" />
      <UserManager
        currentUserId={user!.id}
        rows={users.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          isPartner: u.isPartner,
          isActive: u.isActive,
          hasAcceptedInvitation: u.accounts.length > 0,
        }))}
      />
    </div>
  );
}
