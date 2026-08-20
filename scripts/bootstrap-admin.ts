/**
 * One-time Admin bootstrap (Phase 2 plan §5). Run with:
 *   npm run bootstrap:admin -- --email you@cdclabs.example
 *
 * Refuses to run if any `users` row already exists (single-use guard), and
 * refuses to run without an interactive TTY attached, so it can never be a
 * step in an automated/CI pipeline whose captured output might carry the
 * printed one-time URL. The URL is printed directly to this process's own
 * terminal only — never through the application's email transport, never
 * through any logger, never written to a file.
 */
import { prisma } from "../src/server/prisma";
import { issueInvitationGate } from "../src/lib/auth/invitation";

async function main() {
  if (!process.stdout.isTTY) {
    console.error("Refusing to run without an interactive terminal attached.");
    process.exit(1);
  }

  const emailFlagIndex = process.argv.indexOf("--email");
  const email = emailFlagIndex !== -1 ? process.argv[emailFlagIndex + 1] : undefined;
  if (!email) {
    console.error("Usage: npm run bootstrap:admin -- --email you@example.com");
    process.exit(1);
  }

  const existingCount = await prisma.user.count();
  if (existingCount > 0) {
    console.error(
      `Refusing to bootstrap: ${existingCount} user(s) already exist. This script is only for an empty users table.`,
    );
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      fullName: "Administrator",
      email: email.toLowerCase(),
      role: "ADMIN",
      isPartner: true,
      isActive: true,
    },
  });

  const { rawToken } = await issueInvitationGate(prisma, user.id, { bootstrap: true });

  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = `${baseURL}/accept-invitation/${user.id}?token=${rawToken}`;

  await prisma.auditLog.create({
    data: {
      actorUserId: null,
      action: "CREATE",
      entityType: "user",
      entityId: user.id,
      newValues: { bootstrap: true, role: "ADMIN" },
      capturedAt: new Date(),
    },
  });

  process.stdout.write("\n");
  process.stdout.write(
    "⚠ This link grants Admin access. Do not paste it anywhere but your own browser.\n",
  );
  process.stdout.write(`\n${url}\n\n`);
  process.stdout.write("This link expires in 24 hours and can only be used once.\n\n");
}

main()
  .catch((error) => {
    console.error("Bootstrap failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
