/**
 * Playwright e2e fixture helper — NOT part of the Next.js app (nothing
 * under `src/app`), so it is never compiled into the production route
 * table. Run only via `tsx` (which, like `scripts/bootstrap-admin.ts`,
 * handles the generated Prisma client's ESM/`import.meta` correctly —
 * unlike Playwright's own TypeScript transform, which cannot load that
 * module directly; see `tests/e2e/helpers/create-user.ts` for why this is
 * invoked as a child process instead of imported).
 *
 * Creates a real, sign-in-capable user through the same invitation-
 * acceptance code path the application itself uses, then prints
 * `{ email, id, fullName }` as JSON on stdout. Refuses to run in production as a
 * defense-in-depth measure, even though it can never be reached by a
 * deployed app in the first place (it is never imported by `src/`).
 */
import "dotenv/config"; // this runs as its own child process (see tests/e2e/helpers/create-user.ts) and does not inherit whatever env `next dev` loaded into its own process — load `.env` explicitly, before any module below reads `process.env` at import time
import { prisma } from "../src/server/prisma";
import { auth } from "../src/server/auth";
import { issueInvitationGate, acceptInvitation } from "../src/lib/auth/invitation";
import { randomUUID } from "node:crypto";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("e2e-create-user must never run with NODE_ENV=production.");
  }

  const roleFlag = process.argv.indexOf("--role");
  const passwordFlag = process.argv.indexOf("--password");
  const role = roleFlag !== -1 ? process.argv[roleFlag + 1] : undefined;
  const password = passwordFlag !== -1 ? process.argv[passwordFlag + 1] : undefined;
  if (role !== "OPERATOR" && role !== "PARTNER" && role !== "ADMIN") {
    throw new Error(
      "Usage: tsx scripts/e2e-create-user.ts --role OPERATOR|PARTNER|ADMIN --password <password>",
    );
  }
  if (!password) {
    throw new Error(
      "Usage: tsx scripts/e2e-create-user.ts --role OPERATOR|PARTNER|ADMIN --password <password>",
    );
  }

  const email = `e2e-${role.toLowerCase()}-${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      fullName: `E2E ${role}`,
      email,
      role,
      isPartner: role !== "OPERATOR",
      isActive: true,
    },
  });
  const { rawToken } = await issueInvitationGate(prisma, user.id);
  await acceptInvitation(prisma, auth, { userId: user.id, rawToken, newPassword: password });

  process.stdout.write(JSON.stringify({ email: user.email, id: user.id, fullName: user.fullName }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
