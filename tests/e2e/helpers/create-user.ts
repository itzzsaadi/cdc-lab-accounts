import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Creates a real, sign-in-capable user for a Playwright test by running
 * `scripts/e2e-create-user.ts` via `tsx` as a child process — never by
 * importing server-side Prisma/Better Auth modules directly into the
 * Playwright test process (Playwright's own TypeScript transform cannot
 * load the generated Prisma client, which uses ESM `import.meta`; `tsx`,
 * used identically for `scripts/bootstrap-admin.ts`, handles it
 * correctly), and never by hitting an HTTP endpoint compiled into the
 * Next.js app (no such route exists — see
 * docs/adr/0003-phase-2-authentication.md's Phase 2 closure note).
 */
export async function createActivatedUser(
  role: "OPERATOR" | "PARTNER" | "ADMIN",
  password: string,
): Promise<{ email: string; id: string }> {
  const { stdout } = await execFileAsync(
    "npx",
    ["tsx", "scripts/e2e-create-user.ts", "--role", role, "--password", password],
    { cwd: process.cwd() },
  );
  return JSON.parse(stdout) as { email: string; id: string };
}
