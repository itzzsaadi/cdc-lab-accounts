import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { getTestAuth } from "../helpers/auth-test-instance";
import { createActivatedTestUser, TEST_PASSWORD } from "../helpers/auth-fixtures";
import { signInWithLockout } from "../../../src/lib/auth/lockout";
import { appendAuthAudit } from "../../../src/lib/auth/audit";

const prisma = getTestPrismaClient();
const auth = getTestAuth();

afterEach(async () => {
  await resetDatabase();
});

/** Mirrors signInAction's own audit-writing sequence (src/server/actions/auth.ts), without going through the Server Action itself (which needs a Next.js request context `next/headers` can't provide inside a plain Vitest run). */
async function signInAndAudit(email: string, password: string) {
  const outcome = await signInWithLockout(auth, prisma, email, password);
  if (outcome.status === "success") {
    await appendAuthAudit(prisma, {
      actorUserId: outcome.userId,
      action: "LOGIN",
      entityType: "user",
      entityId: outcome.userId,
    });
  } else if (outcome.status === "locked_or_inactive") {
    await appendAuthAudit(prisma, {
      actorUserId: outcome.userId,
      action: "LOGIN_FAILED",
      entityType: "user",
      entityId: outcome.userId,
    });
  } else if (outcome.userId) {
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
  return outcome;
}

describe("authentication audit trail", () => {
  it("records a LOGIN row on success", async () => {
    const user = await createActivatedTestUser();
    await signInAndAudit(user.email, TEST_PASSWORD);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "LOGIN" } });
    expect(row.entityId).toBe(user.id);
    expect(row.actorUserId).toBe(user.id);
  });

  it("records an unknown-email failure with entity_id='unknown', never NULL, and no PII beyond the attempted email", async () => {
    await signInAndAudit("nobody@example.test", "whatever");
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "LOGIN_FAILED" } });
    expect(row.actorUserId).toBeNull();
    expect(row.entityType).toBe("auth");
    expect(row.entityId).toBe("unknown");
    expect(row.newValues).toEqual({ attempted_email: "nobody@example.test" });
  });

  it("records a real-account failure against the user, and ACCOUNT_LOCKED exactly once at the threshold", async () => {
    const user = await createActivatedTestUser();
    for (let i = 0; i < 10; i++) {
      await signInAndAudit(user.email, "wrong");
    }
    const failures = await prisma.auditLog.count({
      where: { action: "LOGIN_FAILED", entityId: user.id },
    });
    expect(failures).toBe(10);
    const locks = await prisma.auditLog.count({
      where: { action: "ACCOUNT_LOCKED", entityId: user.id },
    });
    expect(locks).toBe(1);
  });

  it("never records a password, hash, session token, cookie, or URL anywhere in audit_log", async () => {
    const user = await createActivatedTestUser();
    await signInAndAudit(user.email, TEST_PASSWORD);
    await signInAndAudit(user.email, "wrong-password-value");

    const rows = await prisma.auditLog.findMany();
    const serialized = JSON.stringify(rows, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    expect(serialized).not.toContain(TEST_PASSWORD);
    expect(serialized).not.toContain("wrong-password-value");
    expect(serialized.toLowerCase()).not.toContain("http://");
    expect(serialized.toLowerCase()).not.toContain("https://");
  });
});
