import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { getTestAuth } from "../helpers/auth-test-instance";
import { createActivatedTestUser, TEST_PASSWORD } from "../helpers/auth-fixtures";
import { pendingInternalResetEmails, internalMintedTokens } from "../../../src/lib/auth/invitation";

const prisma = getTestPrismaClient();
const auth = getTestAuth();

/**
 * `verification.storeIdentifier: "hashed"` (src/lib/auth/config.ts) makes
 * Better Auth hash the *entire* identifier string it builds for a
 * forgot-password token (`reset-password:<rawToken>`) — SHA-256 digest,
 * base64url-encoded without padding (confirmed by reading
 * `better-auth/dist/db/verification-token-storage.mjs`'s `defaultKeyHasher`
 * directly) — before writing it to `verification.identifier`. Default
 * Better Auth behavior stores that identifier in cleartext; this project
 * explicitly overrides it. These tests drive the complete public
 * `requestPasswordReset` → `resetPassword` round trip and prove, by reading
 * the real `verification` table, that no raw token is ever present.
 */
function expectedHashedIdentifier(rawToken: string): string {
  const hash = createHash("sha256").update(`reset-password:${rawToken}`, "utf8").digest();
  return Buffer.from(hash).toString("base64url");
}

afterEach(async () => {
  await resetDatabase();
});

describe("hashed verification storage — Better Auth's own password-reset tokens", () => {
  it("stores the reset identifier hashed, never as cleartext containing the raw token", async () => {
    const user = await createActivatedTestUser();

    pendingInternalResetEmails.add(user.email.toLowerCase());
    let rawToken: string;
    try {
      await auth.api.requestPasswordReset({ body: { email: user.email } });
      rawToken = internalMintedTokens.get(user.email.toLowerCase())!;
    } finally {
      pendingInternalResetEmails.delete(user.email.toLowerCase());
      internalMintedTokens.delete(user.email.toLowerCase());
    }
    expect(rawToken).toBeTruthy();

    const rows = await prisma.verification.findMany();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // No stored identifier is the cleartext Better Auth would otherwise
      // build, and none merely contains the raw token as a substring.
      expect(row.identifier).not.toBe(`reset-password:${rawToken}`);
      expect(row.identifier).not.toContain(rawToken);
    }

    const hashedRow = await prisma.verification.findFirst({
      where: { identifier: expectedHashedIdentifier(rawToken) },
    });
    expect(hashedRow).not.toBeNull();
  });

  it("completes a full reset with the new password and leaves no raw token behind afterward", async () => {
    const user = await createActivatedTestUser();
    const newPassword = "a-different-strong-password-1";

    pendingInternalResetEmails.add(user.email.toLowerCase());
    let rawToken: string;
    try {
      await auth.api.requestPasswordReset({ body: { email: user.email } });
      rawToken = internalMintedTokens.get(user.email.toLowerCase())!;
    } finally {
      pendingInternalResetEmails.delete(user.email.toLowerCase());
      internalMintedTokens.delete(user.email.toLowerCase());
    }

    await auth.api.resetPassword({ body: { token: rawToken, newPassword } });

    // Consumed tokens are deleted by Better Auth itself — confirm the
    // hashed row is gone, not merely that it was never cleartext.
    const afterReset = await prisma.verification.findFirst({
      where: { identifier: expectedHashedIdentifier(rawToken) },
    });
    expect(afterReset).toBeNull();

    // The old password no longer works; the new one does.
    await expect(
      auth.api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } }),
    ).rejects.toThrow();
    const signIn = await auth.api.signInEmail({
      body: { email: user.email, password: newPassword },
    });
    expect(signIn.user.email).toBe(user.email);

    // No row anywhere in the table carries the raw token, post-reset.
    const rows = await prisma.verification.findMany();
    for (const row of rows) {
      expect(row.identifier).not.toContain(rawToken);
      expect(row.value).not.toContain(rawToken);
    }
  });
});
