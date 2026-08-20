import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { getTestAuth } from "../helpers/auth-test-instance";
import { createTestUser } from "../helpers/fixtures";
import {
  issueInvitationGate,
  acceptInvitation,
  InvitationGateError,
} from "../../../src/lib/auth/invitation";

const prisma = getTestPrismaClient();
const auth = getTestAuth();

afterEach(async () => {
  await resetDatabase();
});

describe("invitation gate — token hashing", () => {
  it("stores only a SHA-256 digest, never the raw token", async () => {
    const user = await createTestUser();
    const { rawToken } = await issueInvitationGate(prisma, user.id);

    const row = await prisma.verification.findFirstOrThrow({
      where: { identifier: `invite-gate:${user.id}` },
    });
    expect(row.value).not.toBe(rawToken);
    expect(row.value).toMatch(/^[0-9a-f]{64}$/); // hex SHA-256 digest, not the raw base64url token
  });
});

describe("invitation gate — single-use and retry behavior", () => {
  it("accepts a valid token exactly once and rejects reuse", async () => {
    const user = await createTestUser();
    const { rawToken } = await issueInvitationGate(prisma, user.id);

    await acceptInvitation(prisma, auth, {
      userId: user.id,
      rawToken,
      newPassword: "correct-horse-battery-staple",
    });

    const account = await prisma.account.findFirst({ where: { userId: user.id } });
    expect(account).not.toBeNull();
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toBe("correct-horse-battery-staple"); // hashed, not plaintext

    await expect(
      acceptInvitation(prisma, auth, {
        userId: user.id,
        rawToken,
        newPassword: "another-password-entirely",
      }),
    ).rejects.toThrow(InvitationGateError);
  });

  it("rejects a wrong token with the same generic error as an expired one", async () => {
    const user = await createTestUser();
    await issueInvitationGate(prisma, user.id);

    await expect(
      acceptInvitation(prisma, auth, {
        userId: user.id,
        rawToken: "not-the-real-token",
        newPassword: "correct-horse-battery-staple",
      }),
    ).rejects.toThrow(InvitationGateError);
  });

  it("does not consume the gate token when credential creation fails transiently, allowing a safe retry", async () => {
    const user = await createTestUser();
    const { rawToken } = await issueInvitationGate(prisma, user.id);

    // Better Auth's own minPasswordLength (12, this project's config)
    // rejects this password inside resetPassword — a real failure inside
    // Layer 2, after Layer 1 has already validated. This exercises the
    // exact "transient failure after token validation" scenario safeguard
    // #1 requires: the gate token must not be burned.
    await expect(
      acceptInvitation(prisma, auth, {
        userId: user.id,
        rawToken,
        newPassword: "short",
      }),
    ).rejects.toThrow();

    const stillPresent = await prisma.verification.findFirst({
      where: { identifier: `invite-gate:${user.id}` },
    });
    expect(stillPresent).not.toBeNull();

    // The same, still-valid link now succeeds with a valid password.
    await acceptInvitation(prisma, auth, {
      userId: user.id,
      rawToken,
      newPassword: "correct-horse-battery-staple",
    });
    const account = await prisma.account.findFirst({ where: { userId: user.id } });
    expect(account).not.toBeNull();
  });

  it("reissuing an invitation invalidates every prior token for that user", async () => {
    const user = await createTestUser();
    const first = await issueInvitationGate(prisma, user.id);
    const second = await issueInvitationGate(prisma, user.id);

    await expect(
      acceptInvitation(prisma, auth, {
        userId: user.id,
        rawToken: first.rawToken,
        newPassword: "correct-horse-battery-staple",
      }),
    ).rejects.toThrow(InvitationGateError);

    await acceptInvitation(prisma, auth, {
      userId: user.id,
      rawToken: second.rawToken,
      newPassword: "correct-horse-battery-staple",
    });
    const account = await prisma.account.findFirst({ where: { userId: user.id } });
    expect(account).not.toBeNull();
  });

  it("rejects an expired token", async () => {
    const user = await createTestUser();
    const { rawToken } = await issueInvitationGate(prisma, user.id);
    await prisma.verification.updateMany({
      where: { identifier: `invite-gate:${user.id}` },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      acceptInvitation(prisma, auth, {
        userId: user.id,
        rawToken,
        newPassword: "correct-horse-battery-staple",
      }),
    ).rejects.toThrow(InvitationGateError);
  });
});
