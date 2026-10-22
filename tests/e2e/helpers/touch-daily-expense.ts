import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Simulates a concurrent edit landing on a Daily Expense row between the
 * moment a test opens its edit form and the moment it submits — via
 * `scripts/e2e-touch-daily-expense.ts`, run as a child process (same
 * pattern as `createActivatedUser`/`verifyPartyIncomeRowByNote`).
 *
 * Uses `exec` (which spawns a shell) instead of `execFile` so that
 * Windows can locate `npx.cmd` through the PATH without platform-specific
 * workarounds.
 */
export async function touchDailyExpenseByDescription(
  description: string,
  amount: string,
): Promise<{ id: string; updatedAt: string }> {
  const { stdout } = await execAsync(
    `npx tsx scripts/e2e-touch-daily-expense.ts --description ${description} --amount ${amount}`,
    { cwd: process.cwd() },
  );
  return JSON.parse(stdout);
}
