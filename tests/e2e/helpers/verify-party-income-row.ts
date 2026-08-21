import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Looks up a `party_income` row by its `note` marker via
 * `scripts/e2e-verify-party-income-row.ts`, run as a child process — the
 * same pattern `createActivatedUser` uses for user fixtures, and for the
 * same reason (Playwright's TypeScript transform can't load the generated
 * Prisma client directly; no test-only HTTP route is ever compiled into
 * the app).
 */
export async function verifyPartyIncomeRowByNote(
  note: string,
): Promise<
  { found: false } | { found: true; receiptType: string; amount: string; auditCount: number }
> {
  const { stdout } = await execFileAsync(
    "npx",
    ["tsx", "scripts/e2e-verify-party-income-row.ts", "--note", note],
    { cwd: process.cwd() },
  );
  return JSON.parse(stdout);
}
