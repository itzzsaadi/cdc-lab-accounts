import type { PrismaClient } from "../../../generated/prisma/client";
import type { BetterAuthInstance } from "./config";

const LOCKOUT_THRESHOLD = 10; // FR-AUTH-07, approved (Phase 2 plan §19 decision 5)
const LOCKOUT_MINUTES = 15; // approved, same decision

export type SignInOutcome =
  | { status: "success"; headers: Headers; userId: string }
  | { status: "invalid_credentials"; userId: string | null; justLocked: boolean }
  | { status: "locked_or_inactive"; userId: string };

/**
 * Single atomic statement — safe under concurrent failed attempts against
 * the same account (Postgres row-level locking makes this a genuine
 * read-modify-write, not a separate SELECT then UPDATE race). A `users`
 * row that doesn't exist (unknown email) simply matches zero rows — no
 * special-casing, nothing to leak either way. Returns the matched user's id
 * (or null) and whether *this* attempt is the one that just crossed the
 * lockout threshold, so the caller can write a distinct `ACCOUNT_LOCKED`
 * audit row exactly once, without a second read-then-check race.
 */
async function recordFailedAttempt(
  prisma: PrismaClient,
  email: string,
): Promise<{ userId: string | null; justLocked: boolean }> {
  const rows = await prisma.$queryRaw<Array<{ id: string; failed_login_count: number }>>`
    UPDATE users
    SET failed_login_count = failed_login_count + 1,
        lockout_until = CASE
          WHEN failed_login_count + 1 >= ${LOCKOUT_THRESHOLD}
            THEN now() + (${LOCKOUT_MINUTES}::text || ' minutes')::interval
          ELSE lockout_until
        END
    WHERE lower(email) = lower(${email})
    RETURNING id, failed_login_count
  `;
  const row = rows[0];
  if (!row) {
    return { userId: null, justLocked: false };
  }
  return { userId: row.id, justLocked: row.failed_login_count === LOCKOUT_THRESHOLD };
}

async function resetFailureCounter(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockoutUntil: null },
  });
}

/**
 * The corrected sign-in sequencing (Phase 2 plan §8, revised after review —
 * mandatory safeguard #2). Order matters:
 *
 * 1. Call the *public* `signInEmail` endpoint with `returnHeaders: true`
 *    first, unconditionally. Verified directly in
 *    `better-auth/dist/api/routes/sign-in.mjs`: this endpoint already
 *    performs a same-cost dummy `password.hash` for an unknown email or a
 *    missing credential account, and a real `password.verify` for a real
 *    one, throwing one identical `INVALID_EMAIL_OR_PASSWORD` error in every
 *    failure case — entirely inside Better Auth's own code. Project code
 *    never touches `password.hash`/`password.verify` itself.
 * 2. If it throws: record the failed attempt (step above) and return
 *    `invalid_credentials`. No session was ever created.
 * 3. If it succeeds, `returnHeaders: true` means the `Set-Cookie` header is
 *    returned to *us*, not sent to the browser — Next.js's response
 *    machinery never sees it unless this function's caller explicitly
 *    forwards `headers`. Only now does project code check that user's
 *    `lockoutUntil`/`isActive` (columns Better Auth doesn't manage). If
 *    either is set/false: the just-created session row is deleted
 *    *immediately, directly*, before this function returns anything —
 *    nothing is ever propagated to the caller for that session, and the
 *    function returns `locked_or_inactive` (rendered identically to
 *    `invalid_credentials` by the UI — §11). If neither: the failure
 *    counter is reset and the (still-unforwarded) `headers` are returned to
 *    the caller, whose job is to actually set the cookie on the real
 *    response only at that point.
 *
 * A correct password during lockout, or for a deactivated account, is
 * therefore made to run the exact same work as any other attempt (the full
 * public sign-in call happens regardless) before being turned away — not a
 * cheaper early rejection that would itself be a timing tell.
 */
export async function signInWithLockout(
  auth: BetterAuthInstance,
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<SignInOutcome> {
  let signInResult: { headers: Headers; response: { token: string; user: { id: string } } };
  try {
    signInResult = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
  } catch {
    const { userId, justLocked } = await recordFailedAttempt(prisma, email);
    return { status: "invalid_credentials", userId, justLocked };
  }

  const { headers, response } = signInResult;
  const userId = response.user.id;
  const sessionToken = response.token;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lockoutUntil: true, isActive: true },
  });
  const isLocked = Boolean(user?.lockoutUntil && user.lockoutUntil.getTime() > Date.now());
  const isInactive = user?.isActive === false;

  if (isLocked || isInactive) {
    // Mandatory safeguard #2: revoke before any header/cookie ever
    // propagates. Direct deletion (not the self-service revoke-session
    // endpoint) — at this point the browser holds no cookie at all yet, so
    // there is no "self" session context to call a self-service endpoint
    // through; deletion is immediate because session.cookieCache stays
    // disabled (server/auth.ts), so every request re-validates against this
    // table with no stale cache to separately invalidate (Phase 2 plan §2).
    await prisma.session.deleteMany({ where: { token: sessionToken } });
    return { status: "locked_or_inactive", userId };
  }

  await resetFailureCounter(prisma, userId);
  return { status: "success", headers, userId };
}
