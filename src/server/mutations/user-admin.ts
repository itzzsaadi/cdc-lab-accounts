import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendAuthAudit } from "../../lib/auth/audit";
import { changeUserRoleSchema } from "../../lib/validation/auth";

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Every database-level guard this function can trip (last-active-Admin,
 * partner-flag-removal-while-mapped — both in the
 * phase7_administration_and_import migration) raises a plain, already
 * user-safe `RAISE EXCEPTION` message with no secrets in it — surfaced
 * here verbatim rather than replaced with a generic error, since the
 * whole point of writing those messages by hand was for an Admin to see
 * exactly why the change was refused.
 */
function friendlyDatabaseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    const match = /ERROR:\s*(.+?)(\n|$)/.exec(error.message);
    if (match) return match[1];
  }
  return "This change could not be completed.";
}

/**
 * FR-AUTH-03. Role and partner-flag are changed together (one action, one
 * audit entry) — self-role-downgrade (an Admin demoting their own
 * account) is blocked here, at the application layer, since only the
 * request context knows *who* is asking; the database's own
 * last-active-Admin trigger is a second, independent guard for the same
 * outcome (it fires regardless of which code path issues the UPDATE, not
 * just this action), not a replacement for this check.
 */
export async function changeUserRole(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "user:manage-role");
  const parsed = changeUserRoleSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  if (data.userId === user.id && data.role !== "ADMIN") {
    return {
      ok: false,
      error: "You cannot change your own role away from Admin. Ask another Admin.",
    };
  }
  if (data.userId === user.id && user.isPartner && !data.isPartner) {
    return { ok: false, error: "You cannot remove your own partner status. Ask another Admin." };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: data.userId } });
      await tx.user.update({
        where: { id: data.userId },
        data: { role: data.role, isPartner: data.isPartner },
      });
      await appendAuthAudit(tx, {
        actorUserId: user.id,
        action: "UPDATE",
        entityType: "user",
        entityId: data.userId,
        newValues: {
          old_role: before.role,
          new_role: data.role,
          old_is_partner: before.isPartner,
          new_is_partner: data.isPartner,
        },
      });
      return { ok: true };
    });
  } catch (error) {
    return { ok: false, error: friendlyDatabaseError(error) };
  }
}
