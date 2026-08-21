import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";

/** Minimal placeholder proving Partner-level access — no financial UI (Phase 2 scope). */
export default async function PartnerDashboardPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "report:dashboard");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  return (
    <div>
      <h1 className="text-on-surface text-2xl font-semibold">Partner Dashboard</h1>
      <p className="text-on-surface-variant mt-2 text-sm">
        Signed in as {user!.role}. This placeholder proves Partner-level access only — reports,
        investment, and financial figures are built in later phases.
      </p>
    </div>
  );
}
