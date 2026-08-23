"use server";

import { headers as nextHeaders } from "next/headers";
import { auth } from "../auth";
import { prisma } from "../prisma";
import { getAuthenticatedUser } from "../session";
import { forwardSetCookieHeaders } from "../cookies";
import { requirePermission, PermissionDeniedError } from "../../lib/permissions/guard";
import { signInWithLockout } from "../../lib/auth/lockout";
import {
  acceptInvitation,
  issueInvitationGate,
  InvitationGateError,
  InvitationTransientError,
} from "../../lib/auth/invitation";
import { appendAuthAudit } from "../../lib/auth/audit";
import { sendInvitationEmail } from "../../lib/email/templates";
import {
  signInSchema,
  inviteUserSchema,
  acceptInvitationSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "../../lib/validation/auth";
import { changeUserRole, type MutationResult } from "../mutations/user-admin";

export type { MutationResult };

/** Every action below independently validates its input (Zod, CLAUDE.md §18) and, where authenticated, independently checks role via `requirePermission` (CLAUDE.md §15) — never trusting a client-side guard alone. */

const GENERIC_SIGN_IN_ERROR = "Incorrect email or password.";

export async function signInAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: GENERIC_SIGN_IN_ERROR };
  }
  const { email, password } = parsed.data;

  const outcome = await signInWithLockout(auth, prisma, email, password);

  if (outcome.status === "invalid_credentials") {
    // entity_type/entity_id follow Phase 1's ADR-0002 design exactly: a
    // real user matched (wrong password) gets "user"/<id>; an email
    // matching no account at all gets "auth"/"unknown" — never NULL,
    // since audit_log.entity_id is NOT NULL.
    if (outcome.userId) {
      await appendAuthAudit(prisma, {
        actorUserId: outcome.userId,
        action: "LOGIN_FAILED",
        entityType: "user",
        entityId: outcome.userId,
      });
      if (outcome.justLocked) {
        await appendAuthAudit(prisma, {
          actorUserId: outcome.userId,
          action: "ACCOUNT_LOCKED",
          entityType: "user",
          entityId: outcome.userId,
        });
      }
    } else {
      await appendAuthAudit(prisma, {
        actorUserId: null,
        action: "LOGIN_FAILED",
        entityType: "auth",
        entityId: "unknown",
        newValues: { attempted_email: email.toLowerCase() },
      });
    }
    return { ok: false, error: GENERIC_SIGN_IN_ERROR };
  }
  if (outcome.status === "locked_or_inactive") {
    // Same generic message as invalid_credentials — no enumeration signal
    // at the sign-in form (Phase 2 plan §8/§11/§19 decision 17). The
    // session was already revoked before this function was ever reached
    // (src/lib/auth/lockout.ts) — nothing to forward here.
    await appendAuthAudit(prisma, {
      actorUserId: outcome.userId,
      action: "LOGIN_FAILED",
      entityType: "user",
      entityId: outcome.userId,
    });
    return { ok: false, error: GENERIC_SIGN_IN_ERROR };
  }

  // Success — only now do we forward the session cookie to the browser.
  await forwardSetCookieHeaders(outcome.headers);
  await appendAuthAudit(prisma, {
    actorUserId: outcome.userId,
    action: "LOGIN",
    entityType: "user",
    entityId: outcome.userId,
  });
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  const headers = await nextHeaders();
  const result = await auth.api.signOut({ headers, returnHeaders: true });
  await forwardSetCookieHeaders(result.headers);
  const session = await auth.api.getSession({ headers });
  if (session) {
    await appendAuthAudit(prisma, {
      actorUserId: session.user.id,
      action: "SESSION_REVOKED",
      entityType: "user",
      entityId: session.user.id,
    });
  }
}

export async function inviteUserAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await nextHeaders();
  const currentUser = await getAuthenticatedUser(headers);
  requirePermission(currentUser, "user:invite");

  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input." };
  }
  const { email, role, isPartner } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { ok: false, error: "A user with this email already exists." };
  }

  const user = await prisma.user.create({
    data: { fullName: normalizedEmail, email: normalizedEmail, role, isPartner, isActive: true },
  });
  const { rawToken } = await issueInvitationGate(prisma, user.id);
  const url = `${process.env.BETTER_AUTH_URL}/accept-invitation/${user.id}?token=${rawToken}`;
  await sendInvitationEmail(user.email, url);

  await appendAuthAudit(prisma, {
    actorUserId: currentUser!.id,
    action: "CREATE",
    entityType: "user",
    entityId: user.id,
    newValues: { invited_role: role, invited_is_partner: isPartner },
  });

  return { ok: true };
}

export async function reissueInvitationAction(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await nextHeaders();
  const currentUser = await getAuthenticatedUser(headers);
  requirePermission(currentUser, "user:invite");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true },
  });
  if (!target || target.accounts.length > 0) {
    return { ok: false, error: "This user cannot be re-invited." };
  }

  const { rawToken } = await issueInvitationGate(prisma, userId);
  const url = `${process.env.BETTER_AUTH_URL}/accept-invitation/${userId}?token=${rawToken}`;
  await sendInvitationEmail(target.email, url);

  await appendAuthAudit(prisma, {
    actorUserId: currentUser!.id,
    action: "UPDATE",
    entityType: "user",
    entityId: userId,
    newValues: { invitation_reissued: true },
  });

  return { ok: true };
}

export async function acceptInvitationAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "This invitation link is no longer valid." };
  }
  try {
    const { userId } = await acceptInvitation(prisma, auth, {
      userId: parsed.data.userId,
      rawToken: parsed.data.token,
      newPassword: parsed.data.newPassword,
    });
    const account = await prisma.account.findFirst({ where: { userId } });
    await appendAuthAudit(prisma, {
      actorUserId: userId,
      action: "CREATE",
      entityType: "account",
      entityId: account?.id ?? userId,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof InvitationGateError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof InvitationTransientError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function requestPasswordResetAction(input: unknown): Promise<{ ok: true }> {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (parsed.success) {
    // Better Auth's own endpoint already responds identically whether or
    // not the email exists (verified in better-auth/dist/api/routes/password.mjs)
    // — this project never branches on the result.
    await auth.api.requestPasswordReset({ body: { email: parsed.data.email.toLowerCase() } });
  }
  return { ok: true };
}

export async function resetPasswordAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "This reset link is no longer valid." };
  }
  try {
    await auth.api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.newPassword },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "This reset link is no longer valid." };
  }
}

/** Mirrors the DB trigger's own message shape (users_last_admin_protection) so an Admin sees the real reason rather than a generic failure — see src/server/mutations/user-admin.ts's identical helper. */
function friendlyDatabaseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    const match = /ERROR:\s*(.+?)(\n|$)/.exec(error.message);
    if (match) return match[1];
  }
  return "This change could not be completed.";
}

export async function deactivateUserAction(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await nextHeaders();
  const currentUser = await getAuthenticatedUser(headers);
  requirePermission(currentUser, "user:deactivate");

  // Self-deactivation is refused at the application layer (only the
  // request context knows who is asking); the database's own
  // last-active-Admin trigger is a second, independent guard for the same
  // "don't lock the system out" outcome, not a substitute for this check
  // — an Admin deactivating themself while other Admins remain active is
  // still a bad idea worth blocking outright.
  if (userId === currentUser!.id) {
    return { ok: false, error: "You cannot deactivate your own account. Ask another Admin." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive: false } });
      // Explicit, direct deletion here too (belt and suspenders with the
      // database's own users_revoke_sessions_on_authorization_change
      // trigger, which fires on this same UPDATE) — no supported public
      // API exists for one user revoking another's sessions (verified:
      // revoke-session/-sessions/-other-sessions are all self-service
      // only). Safe because cookieCache stays disabled (src/server/auth.ts)
      // — every request re-validates against this table.
      await tx.session.deleteMany({ where: { userId } });
      await appendAuthAudit(tx, {
        actorUserId: currentUser!.id,
        action: "ARCHIVE",
        entityType: "user",
        entityId: userId,
      });
      await appendAuthAudit(tx, {
        actorUserId: currentUser!.id,
        action: "SESSION_REVOKED",
        entityType: "user",
        entityId: userId,
      });
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyDatabaseError(error) };
  }
}

export async function reactivateUserAction(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await nextHeaders();
  const currentUser = await getAuthenticatedUser(headers);
  requirePermission(currentUser, "user:deactivate");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive: true } });
    await appendAuthAudit(tx, {
      actorUserId: currentUser!.id,
      action: "UPDATE",
      entityType: "user",
      entityId: userId,
      newValues: { is_active: true },
    });
  });

  return { ok: true };
}

export async function changeUserRoleAction(input: unknown): Promise<MutationResult> {
  const headers = await nextHeaders();
  const currentUser = await getAuthenticatedUser(headers);
  return changeUserRole(prisma, currentUser, input);
}

export { PermissionDeniedError };
