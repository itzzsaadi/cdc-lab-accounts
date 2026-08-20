import { randomUUID } from "node:crypto";
import { getTestPrismaClient } from "./test-db";
import { getTestAuth } from "./auth-test-instance";
import { issueInvitationGate, acceptInvitation } from "../../../src/lib/auth/invitation";
import type { Role } from "../../../generated/prisma/enums";

export const TEST_PASSWORD = "correct-horse-battery-staple";

/**
 * Creates a real, sign-in-capable user (a `users` row plus a genuine
 * Better Auth `account` row with a real hashed password) by driving the
 * same invitation-acceptance code path the application uses — never a
 * hand-rolled credential, so tests exercise the real flow.
 */
export async function createActivatedTestUser(
  overrides: { role?: Role; isPartner?: boolean; isActive?: boolean } = {},
) {
  const prisma = getTestPrismaClient();
  const auth = getTestAuth();
  const email = `activated-${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      fullName: "Test User",
      email,
      role: overrides.role ?? "OPERATOR",
      isPartner: overrides.isPartner ?? false,
      isActive: overrides.isActive ?? true,
    },
  });
  const { rawToken } = await issueInvitationGate(prisma, user.id);
  await acceptInvitation(prisma, auth, {
    userId: user.id,
    rawToken,
    newPassword: TEST_PASSWORD,
  });
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}
