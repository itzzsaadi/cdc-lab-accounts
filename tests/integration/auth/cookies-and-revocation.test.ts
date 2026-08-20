import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { getTestAuth } from "../helpers/auth-test-instance";
import { createActivatedTestUser, TEST_PASSWORD } from "../helpers/auth-fixtures";
import { signInWithLockout } from "../../../src/lib/auth/lockout";
import { buildAuth } from "../../../src/lib/auth/config";

const prisma = getTestPrismaClient();
const auth = getTestAuth();
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(async () => {
  await resetDatabase();
});

function parseSetCookie(headers: Headers) {
  const cookies = headers.getSetCookie();
  const sessionCookie = cookies.find((c) => c.toLowerCase().includes("session"));
  return sessionCookie;
}

describe("cookie policy — environment-aware, never forced", () => {
  it("omits Secure over a local HTTP origin (dev/Playwright)", async () => {
    const user = await createActivatedTestUser();
    const httpAuth = buildAuth(prisma, "http://localhost:3000");
    const result = await httpAuth.api.signInEmail({
      body: { email: user.email, password: TEST_PASSWORD },
      returnHeaders: true,
    });
    const cookie = parseSetCookie(result.headers);
    expect(cookie).toBeTruthy();
    expect(cookie!.toLowerCase()).not.toContain("secure");
    expect(cookie!.toLowerCase()).toContain("httponly");
    expect(cookie!.toLowerCase()).toContain("samesite=lax");
  });

  it("sets Secure when running in production with an HTTPS origin", async () => {
    const user = await createActivatedTestUser();
    const previousNodeEnv = mutableEnv.NODE_ENV;
    mutableEnv.NODE_ENV = "production";
    try {
      const httpsAuth = buildAuth(prisma, "https://cdclabs.example");
      const result = await httpsAuth.api.signInEmail({
        body: { email: user.email, password: TEST_PASSWORD },
        returnHeaders: true,
      });
      const cookie = parseSetCookie(result.headers);
      expect(cookie).toBeTruthy();
      expect(cookie!.toLowerCase()).toContain("secure");
      expect(cookie!.toLowerCase()).toContain("httponly");
    } finally {
      mutableEnv.NODE_ENV = previousNodeEnv;
    }
  });
});

describe("session revocation rejects a previously issued cookie afterward", () => {
  it("sign-out: a cookie captured before sign-out is rejected after it", async () => {
    const user = await createActivatedTestUser();
    const outcome = await signInWithLockout(auth, prisma, user.email, TEST_PASSWORD);
    if (outcome.status !== "success") throw new Error("expected success");
    const cookie = parseSetCookie(outcome.headers)!;
    const cookieValue = cookie.split(";")[0];

    const before = await auth.api.getSession({ headers: new Headers({ cookie: cookieValue }) });
    expect(before).not.toBeNull();

    await auth.api.signOut({ headers: new Headers({ cookie: cookieValue }) });

    const after = await auth.api.getSession({ headers: new Headers({ cookie: cookieValue }) });
    expect(after).toBeNull();
  });

  it("password reset: a cookie captured before the reset is rejected after it (revokeSessionsOnPasswordReset)", async () => {
    const user = await createActivatedTestUser();
    const outcome = await signInWithLockout(auth, prisma, user.email, TEST_PASSWORD);
    if (outcome.status !== "success") throw new Error("expected success");
    const cookie = parseSetCookie(outcome.headers)!;
    const cookieValue = cookie.split(";")[0];

    const before = await auth.api.getSession({ headers: new Headers({ cookie: cookieValue }) });
    expect(before).not.toBeNull();

    // verification.identifier is stored hashed (storeIdentifier: "hashed"),
    // so a test cannot recover a real forgot-password link's raw token from
    // the table. Driving the reset through the same internal-capture
    // mechanism invitation.ts uses (rather than parsing an email) is the
    // realistic way to obtain a genuine raw token here.
    const { pendingInternalResetEmails, internalMintedTokens } =
      await import("../../../src/lib/auth/invitation");
    pendingInternalResetEmails.add(user.email.toLowerCase());
    await auth.api.requestPasswordReset({ body: { email: user.email } });
    const token = internalMintedTokens.get(user.email.toLowerCase());
    pendingInternalResetEmails.delete(user.email.toLowerCase());
    internalMintedTokens.delete(user.email.toLowerCase());
    expect(token).toBeTruthy();

    await auth.api.resetPassword({ body: { token: token!, newPassword: "a-new-password-123" } });

    const after = await auth.api.getSession({ headers: new Headers({ cookie: cookieValue }) });
    expect(after).toBeNull();
  });

  it("deactivation: a cookie captured before deactivation is rejected after it (direct session deletion)", async () => {
    const user = await createActivatedTestUser();
    const outcome = await signInWithLockout(auth, prisma, user.email, TEST_PASSWORD);
    if (outcome.status !== "success") throw new Error("expected success");
    const cookie = parseSetCookie(outcome.headers)!;
    const cookieValue = cookie.split(";")[0];

    const before = await auth.api.getSession({ headers: new Headers({ cookie: cookieValue }) });
    expect(before).not.toBeNull();

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await prisma.session.deleteMany({ where: { userId: user.id } });

    const after = await auth.api.getSession({ headers: new Headers({ cookie: cookieValue }) });
    expect(after).toBeNull();
  });
});
