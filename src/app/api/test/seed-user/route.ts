import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../../server/prisma";
import { auth } from "../../../../server/auth";
import { issueInvitationGate, acceptInvitation } from "../../../../lib/auth/invitation";

/**
 * Test-only fixture endpoint for Playwright (tests/e2e/auth.spec.ts).
 * Exists purely so e2e tests can create a real, sign-in-capable user
 * through the app's own already-working module graph, rather than
 * importing server-side Prisma/Better Auth modules directly into the
 * Playwright test process (which hits an unrelated ESM/CJS interop
 * mismatch in Playwright's own TypeScript transform — Next.js's own
 * bundler has no such issue, as `npm run build`/`npm run dev` both prove).
 * Refuses to run outside a non-production environment — the same
 * fail-closed pattern used throughout Phase 2 (src/lib/email/transport.ts,
 * src/server/auth.ts).
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 403 });
  }

  const body = (await request.json()) as {
    role: "OPERATOR" | "PARTNER" | "ADMIN";
    password: string;
  };

  const email = `e2e-${body.role.toLowerCase()}-${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      fullName: `E2E ${body.role}`,
      email,
      role: body.role,
      isPartner: body.role !== "OPERATOR",
      isActive: true,
    },
  });
  const { rawToken } = await issueInvitationGate(prisma, user.id);
  await acceptInvitation(prisma, auth, {
    userId: user.id,
    rawToken,
    newPassword: body.password,
  });

  return NextResponse.json({ email: user.email, id: user.id });
}
