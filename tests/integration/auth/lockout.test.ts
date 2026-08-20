import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { getTestAuth } from "../helpers/auth-test-instance";
import { createActivatedTestUser, TEST_PASSWORD } from "../helpers/auth-fixtures";
import { signInWithLockout } from "../../../src/lib/auth/lockout";

const prisma = getTestPrismaClient();
const auth = getTestAuth();

afterEach(async () => {
  await resetDatabase();
});

describe("sign-in lockout", () => {
  it("locks after 10 consecutive failures and rejects a subsequently-correct password", async () => {
    const user = await createActivatedTestUser();

    for (let i = 0; i < 10; i++) {
      const outcome = await signInWithLockout(auth, prisma, user.email, "wrong-password");
      expect(outcome.status).toBe("invalid_credentials");
    }

    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.failedLoginCount).toBe(10);
    expect(locked.lockoutUntil).not.toBeNull();
    expect(locked.lockoutUntil!.getTime()).toBeGreaterThan(Date.now());

    // A correct password during lockout still fails, generically.
    const duringLockout = await signInWithLockout(auth, prisma, user.email, TEST_PASSWORD);
    expect(duringLockout.status).toBe("locked_or_inactive");
  });

  it("never lets a session created during a locked/inactive attempt reach the caller, and revokes it immediately", async () => {
    const user = await createActivatedTestUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { lockoutUntil: new Date(Date.now() + 60_000) },
    });

    const sessionsBefore = await prisma.session.count();
    const outcome = await signInWithLockout(auth, prisma, user.email, TEST_PASSWORD);

    expect(outcome.status).toBe("locked_or_inactive");
    expect("headers" in outcome).toBe(false); // no Set-Cookie headers are ever exposed on this branch
    const sessionsAfter = await prisma.session.count();
    expect(sessionsAfter).toBe(sessionsBefore); // the session Better Auth created internally was deleted, not left behind
  });

  it("denies a deactivated account identically to a locked one, and revokes its session", async () => {
    const user = await createActivatedTestUser({ isActive: false });
    const outcome = await signInWithLockout(auth, prisma, user.email, TEST_PASSWORD);
    expect(outcome.status).toBe("locked_or_inactive");
    const sessions = await prisma.session.count({ where: { userId: user.id } });
    expect(sessions).toBe(0);
  });

  it("resets the failure counter on a successful sign-in", async () => {
    const user = await createActivatedTestUser();
    await signInWithLockout(auth, prisma, user.email, "wrong-password");
    await signInWithLockout(auth, prisma, user.email, "wrong-password");

    const outcome = await signInWithLockout(auth, prisma, user.email, TEST_PASSWORD);
    expect(outcome.status).toBe("success");

    const reset = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reset.failedLoginCount).toBe(0);
    expect(reset.lockoutUntil).toBeNull();
  });

  it("does not create a users row for an unknown email, and produces the same generic outcome as a wrong password", async () => {
    const before = await prisma.user.count();
    const outcome = await signInWithLockout(auth, prisma, "no-such-user@example.test", "whatever");
    expect(outcome.status).toBe("invalid_credentials");
    const after = await prisma.user.count();
    expect(after).toBe(before);
  });

  it("handles concurrent failed attempts against the same account atomically, reaching exactly the threshold", async () => {
    const user = await createActivatedTestUser();
    await Promise.all(
      Array.from({ length: 10 }, () => signInWithLockout(auth, prisma, user.email, "wrong")),
    );
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.failedLoginCount).toBe(10);
    expect(locked.lockoutUntil).not.toBeNull();
  });
});
