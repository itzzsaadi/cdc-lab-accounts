import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "../../../generated/prisma/client";
import { sendPasswordResetEmail } from "../email/templates";
import { pendingInternalResetEmails, internalMintedTokens } from "./invitation";

/**
 * Builds a Better Auth instance from an explicit Prisma client and base
 * URL — a factory, not a module-level singleton, specifically so
 * integration tests can point it at `TEST_DATABASE_URL` via their own
 * Prisma client (see tests/integration/helpers/test-db.ts) rather than
 * the application's `DATABASE_URL`-bound one. `src/server/auth.ts` is the
 * one real singleton the application itself uses, built by calling this
 * with the shared runtime client.
 *
 * Grounded in direct inspection of better-auth@1.7.1 — see
 * docs/adr/0003-phase-2-authentication.md for the evidence trail (cookie
 * defaults, CSRF/origin-check defaults, verification token storage,
 * session-revocation API scope, sign-in enumeration-safety behavior).
 */
export function buildAuth(prisma: PrismaClient, baseURL: string) {
  const isProduction = process.env.NODE_ENV === "production";

  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    appName: "CDC Lab Accounts System",
    baseURL,
    user: {
      // The Prisma *Client* property name (`prisma.user`, from `model User`
      // in schema.prisma, which itself maps to the `users` table via
      // `@@map`) — not the `@@map`-ed table name. The adapter looks this
      // up as `db[modelName]` against the generated client directly.
      modelName: "user",
      fields: { name: "fullName" },
      additionalFields: {
        role: { type: "string", required: true, input: false },
        isPartner: { type: "boolean", required: true, input: false },
        isActive: { type: "boolean", required: true, input: false },
      },
    },
    session: {
      modelName: "session", // prisma.session, from `model Session` (`@@map("sessions")`)
      expiresIn: 60 * 60 * 24 * 30, // FR-AUTH-05: 30 days
      cookieCache: { enabled: false }, // default — kept explicit: every request re-validates against `sessions`, so direct row deletion (lockout, deactivation) is immediately effective
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // no public self-registration — every account exists via invitation or bootstrap
      minPasswordLength: 12, // approved, stricter than Better Auth's own default of 8
      resetPasswordTokenExpiresIn: 60 * 60, // FR-AUTH-06: 60 minutes
      revokeSessionsOnPasswordReset: true,
      autoSignIn: false,
      async sendResetPassword({ user, url, token }) {
        const email = user.email.toLowerCase();
        if (pendingInternalResetEmails.has(email)) {
          // Internal invitation/bootstrap completion (invitation.ts) —
          // capture the token, send no email, never log `url`/`token`.
          internalMintedTokens.set(email, token);
          return;
        }
        await sendPasswordResetEmail(user.email, url);
      },
      async onPasswordReset({ user }) {
        await prisma.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "PASSWORD_CHANGE",
            entityType: "user",
            entityId: user.id,
            capturedAt: new Date(),
          },
        });
      },
    },
    advanced: {
      useSecureCookies: isProduction,
      database: { generateId: "uuid" },
      // disableCSRFCheck / disableOriginCheck: never set — defaults (false)
      // keep CSRF/origin protection on.
    },
    trustedOrigins: [baseURL], // exactly one explicit origin, never a wildcard
    rateLimit: { enabled: true }, // IP-based abuse throttling — NOT the FR-AUTH-07 account lockout, see lockout.ts
    verification: { storeIdentifier: "hashed" }, // default is "plain" (verified in better-auth/dist/api/routes/password.mjs) — this project explicitly overrides it
    plugins: [], // deliberately no admin plugin — see docs/adr/0003-phase-2-authentication.md
  });
}

export type BetterAuthInstance = ReturnType<typeof buildAuth>;
