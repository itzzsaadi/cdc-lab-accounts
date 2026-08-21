import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { prisma } from "../../../../server/prisma";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";

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
    <div>
      <h1 className="text-on-surface text-2xl font-semibold">Users</h1>
      <div className="mt-4">
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {users.map((row) => (
              <Tr key={row.id}>
                <Td>{row.fullName}</Td>
                <Td>{row.email}</Td>
                <Td>{row.role}</Td>
                <Td>{row.isActive ? "Active" : "Inactive"}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}
