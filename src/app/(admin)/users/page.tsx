import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../lib/permissions/guard";
import { prisma } from "../../../server/prisma";

/** Minimal placeholder (list only) proving Admin-level access — full user management is a later-phase build. */
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
    select: { id: true, fullName: true, email: true, role: true, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-on-surface">Users</h1>
      <table className="mt-4 text-sm">
        <thead>
          <tr className="text-left text-on-surface-variant">
            <th className="pr-6">Name</th>
            <th className="pr-6">Email</th>
            <th className="pr-6">Role</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((row) => (
            <tr key={row.id}>
              <td className="pr-6">{row.fullName}</td>
              <td className="pr-6">{row.email}</td>
              <td className="pr-6">{row.role}</td>
              <td>{row.isActive ? "Active" : "Inactive"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
