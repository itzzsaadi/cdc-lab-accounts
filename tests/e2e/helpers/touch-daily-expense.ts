import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Simulates a concurrent edit landing on a Daily Expense row between the
 * moment a test opens its edit form and the moment it submits — via
 * `scripts/e2e-touch-daily-expense.ts`, run as a child process (same
 * pattern as `createActivatedUser`/`verifyPartyIncomeRowByNote`).
 */
export async function touchDailyExpenseByDescription(
  description: string,
  amount: string,
): Promise<{ id: string; updatedAt: string }> {
  const { stdout } = await execFileAsync(
    "npx",
    ["tsx", "scripts/e2e-touch-daily-expense.ts", "--description", description, "--amount", amount],
    { cwd: process.cwd() },
  );
  return JSON.parse(stdout);
}
