import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../lib/permissions/guard";

/**
 * Minimal placeholder proving role protection (Phase 2 scope) — not a real
 * financial screen. `requirePermission` is the same function every
 * Server Component/Action/Route Handler calls (src/lib/permissions/guard.ts).
 */
export default async function OperatorHomePage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "entry:daily-expense");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-on-surface">Operator Home</h1>
      <p className="text-sm text-on-surface-variant mt-2">
        Signed in as {user!.role}. This placeholder proves Operator-level access only — no financial
        UI is built in Phase 2.
      </p>
    </main>
  );
}
