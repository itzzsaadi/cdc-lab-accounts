import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getTestPrismaClient, getTestDatabaseUrl } from "../helpers/test-db";
import { resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

beforeAll(() => {
  getTestDatabaseUrl();
});

afterEach(async () => {
  await resetDatabase();
});

describe("Phase 2 authentication schema", () => {
  it("enforces sessions.token uniqueness", async () => {
    const user = await createTestUser();
    const token = randomUUID();
    await prisma.session.create({
      data: { id: randomUUID(), token, expiresAt: new Date(Date.now() + 1000), userId: user.id },
    });
    await expect(
      prisma.session.create({
        data: {
          id: randomUUID(),
          token,
          expiresAt: new Date(Date.now() + 1000),
          userId: user.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces account (issuer, accountId) uniqueness", async () => {
    const user = await createTestUser();
    await prisma.account.create({
      data: {
        issuer: "local:credential",
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
      },
    });
    await expect(
      prisma.account.create({
        data: {
          issuer: "local:credential",
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("still rejects a physical DELETE on users, unchanged by Phase 2", async () => {
    const user = await createTestUser();
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow();
  });

  it("allows sessions, account, and verification rows to be physically deleted — deliberately not trigger-protected", async () => {
    const user = await createTestUser();
    const session = await prisma.session.create({
      data: {
        id: randomUUID(),
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 1000),
        userId: user.id,
      },
    });
    await expect(prisma.session.delete({ where: { id: session.id } })).resolves.toBeDefined();

    const account = await prisma.account.create({
      data: {
        issuer: "local:credential",
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
      },
    });
    await expect(prisma.account.delete({ where: { id: account.id } })).resolves.toBeDefined();

    const verification = await prisma.verification.create({
      data: { identifier: "test:x", value: "y", expiresAt: new Date(Date.now() + 1000) },
    });
    await expect(
      prisma.verification.delete({ where: { id: verification.id } }),
    ).resolves.toBeDefined();
  });

  it("cascades session/account deletion when a users row is removed (would only matter if the delete trigger ever allowed it)", async () => {
    // Documents the FK behavior itself (onDelete: Cascade) without relying
    // on ever actually deleting a `users` row, which the trigger above
    // proves is impossible in this system.
    const fk = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      WHERE rc.constraint_name = 'sessions_user_id_fkey'
    `;
    expect(fk[0]?.delete_rule).toBe("CASCADE");
  });
});
