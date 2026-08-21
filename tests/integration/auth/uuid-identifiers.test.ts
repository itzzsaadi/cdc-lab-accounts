import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { getTestAuth } from "../helpers/auth-test-instance";
import { createActivatedTestUser, TEST_PASSWORD } from "../helpers/auth-fixtures";
import { signInWithLockout } from "../../../src/lib/auth/lockout";
import { pendingInternalResetEmails } from "../../../src/lib/auth/invitation";

const prisma = getTestPrismaClient();
const auth = getTestAuth();

/**
 * `advanced.database.generateId: "uuid"` makes Better Auth mint every id it
 * writes application-side via `crypto.randomUUID()` (confirmed by direct
 * source inspection during Phase 2 planning — not a Postgres-side default).
 * These tests prove those Better-Auth-generated values actually satisfy the
 * strict RFC 4122 shape the Prisma schema's `@db.Uuid` columns require
 * (`users.id`, `sessions.id`/`user_id`, `account.id`/`user_id`,
 * `verification.id`), driven only through real public Better Auth flows —
 * never a hand-constructed id.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

afterEach(async () => {
  await resetDatabase();
});

describe("Better Auth identifiers are valid UUIDs", () => {
  it("account.id and account.userId are valid UUIDs after invitation acceptance creates the credential", async () => {
    const user = await createActivatedTestUser();
    expect(user.id).toMatch(UUID_RE);

    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.id).toMatch(UUID_RE);
    expect(account.userId).toMatch(UUID_RE);
    expect(account.userId).toBe(user.id);
  });

  it("session.id and session.userId are valid UUIDs after a real sign-in", async () => {
    const user = await createActivatedTestUser();
    const outcome = await signInWithLockout(auth, prisma, user.email, TEST_PASSWORD);
    if (outcome.status !== "success") throw new Error("expected a successful sign-in");

    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.id).toMatch(UUID_RE);
    expect(session.userId).toMatch(UUID_RE);
    expect(session.userId).toBe(user.id);
  });

  it("verification.id is a valid UUID after Better Auth issues a password-reset token", async () => {
    const user = await createActivatedTestUser();
    pendingInternalResetEmails.add(user.email.toLowerCase());
    try {
      await auth.api.requestPasswordReset({ body: { email: user.email } });
    } finally {
      pendingInternalResetEmails.delete(user.email.toLowerCase());
    }

    const verification = await prisma.verification.findFirstOrThrow();
    expect(verification.id).toMatch(UUID_RE);
  });
});
