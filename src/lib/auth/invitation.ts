import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client";
import type { BetterAuthInstance } from "./config";

/**
 * Invitation-gate tokens (Phase 2 plan §6). This is our own code, entirely
 * separate from Better Auth's internal adapter — a plain Prisma row in the
 * shared `verification` table, identified by a prefix Better Auth's own
 * routes never look for (`reset-password:` is the only prefix Better Auth
 * itself constructs and searches for). Only a SHA-256 digest of the raw
 * token is ever stored; the raw token lives only in the emailed URL.
 */

const GATE_PREFIX = "invite-gate:";
const GATE_TTL_MS_DEFAULT = 72 * 60 * 60 * 1000; // 72 hours, approved (Phase 2 plan §19 decision 4)
const GATE_TTL_MS_BOOTSTRAP = 24 * 60 * 60 * 1000; // shorter — the operator completes it immediately

function digest(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function identifierFor(userId: string): string {
  return `${GATE_PREFIX}${userId}`;
}

export interface IssuedInvitationGate {
  rawToken: string;
}

/**
 * Issues a fresh invitation-gate token for `userId`, first deleting *every*
 * prior gate row for that user (reissuing invalidates all earlier tokens,
 * not just the most recent — Phase 2 plan §6 step 7).
 */
export async function issueInvitationGate(
  prisma: PrismaClient,
  userId: string,
  options: { bootstrap?: boolean } = {},
): Promise<IssuedInvitationGate> {
  const rawToken = randomBytes(32).toString("base64url");
  const ttl = options.bootstrap ? GATE_TTL_MS_BOOTSTRAP : GATE_TTL_MS_DEFAULT;
  const identifier = identifierFor(userId);
  await prisma.$transaction([
    prisma.verification.deleteMany({ where: { identifier } }),
    prisma.verification.create({
      data: {
        identifier,
        value: digest(rawToken),
        expiresAt: new Date(Date.now() + ttl),
      },
    }),
  ]);
  return { rawToken };
}

export class InvitationGateError extends Error {}
export class InvitationTransientError extends Error {}

/**
 * Populated by `server/auth.ts`'s `sendResetPassword` callback: when it
 * sees the recipient's (lowercased) email in `pendingInternalResetEmails`,
 * it stores the minted token here instead of sending any email. Better
 * Auth's own `requestPasswordReset` route `await`s `sendResetPassword`
 * before returning (confirmed by reading
 * `better-auth/dist/api/routes/password.mjs`), so by the time
 * `auth.api.requestPasswordReset(...)` resolves below, the token is
 * already here — no polling, no race beyond what the advisory lock in
 * `acceptInvitation` already serializes per user.
 */
export const pendingInternalResetEmails = new Set<string>();
export const internalMintedTokens = new Map<string, string>();

async function completeCredentialViaResetFlow(
  auth: BetterAuthInstance,
  email: string,
  newPassword: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  pendingInternalResetEmails.add(normalizedEmail);
  try {
    await auth.api.requestPasswordReset({ body: { email: normalizedEmail } });
  } finally {
    pendingInternalResetEmails.delete(normalizedEmail);
  }
  const mintedToken = internalMintedTokens.get(normalizedEmail);
  internalMintedTokens.delete(normalizedEmail);
  if (!mintedToken) {
    throw new Error("Better Auth did not mint a reset token for this account.");
  }
  // Public endpoint, per Better Auth's own documented mechanism — this is
  // what actually creates the `account` row and hashes the password,
  // entirely inside Better Auth's own code (§6 of the Phase 2 plan).
  await auth.api.resetPassword({ body: { token: mintedToken, newPassword } });
}

/**
 * Validates and, only on full success, consumes an invitation-gate token,
 * then completes credential creation entirely through Better Auth's public
 * API (`requestPasswordReset` + `resetPassword`).
 *
 * Concurrency and failure-recovery design (Phase 2 plan, mandatory
 * safeguard #1): the whole check-then-act sequence runs inside one
 * `prisma.$transaction`, serialized per user via a transaction-scoped
 * Postgres advisory lock (`pg_advisory_xact_lock`, auto-released at COMMIT
 * or ROLLBACK — no manual unlock, so nothing can leak a held lock even if
 * this throws). The gate row is deleted **only after** Better Auth's own
 * `resetPassword` call has returned successfully; if any step before that
 * throws, the transaction rolls back and the gate row is left exactly as
 * it was — untouched, still valid, safely retryable with the same link.
 * This is what prevents a transient failure from permanently burning a
 * legitimate invitation: the token's consumption and the credential's
 * creation succeed or fail together, never one without the other.
 */
export async function acceptInvitation(
  prisma: PrismaClient,
  auth: BetterAuthInstance,
  input: { userId: string; rawToken: string; newPassword: string },
): Promise<{ userId: string }> {
  const identifier = identifierFor(input.userId);
  const submittedDigest = Buffer.from(digest(input.rawToken), "hex");

  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identifier})::bigint)`;

        const row = await tx.verification.findFirst({ where: { identifier } });
        if (!row || row.expiresAt.getTime() < Date.now()) {
          throw new InvitationGateError("This invitation link is no longer valid.");
        }
        const storedDigest = Buffer.from(row.value, "hex");
        if (
          storedDigest.length !== submittedDigest.length ||
          !timingSafeEqual(storedDigest, submittedDigest)
        ) {
          throw new InvitationGateError("This invitation link is no longer valid.");
        }

        const user = await tx.user.findUnique({ where: { id: input.userId } });
        if (!user) {
          throw new InvitationGateError("This invitation link is no longer valid.");
        }

        // Layer 2 — entirely Better Auth's own public API. A thrown error
        // here (network hiccup, transient DB error inside Better Auth's own
        // adapter calls) propagates out of this callback, rolling back our
        // transaction — the gate row above is NOT deleted, so the exact
        // same link remains valid for a retry.
        await completeCredentialViaResetFlow(auth, user.email, input.newPassword);

        // Only now, after full success, consume the gate — single-use from
        // this point on.
        await tx.verification.deleteMany({ where: { identifier } });

        return { userId: input.userId };
      },
      { timeout: 10_000 },
    );
  } catch (error) {
    if (error instanceof InvitationGateError) throw error;
    throw new InvitationTransientError(
      "Could not complete account setup due to a temporary server error. Please try the same link again.",
    );
  }
}
