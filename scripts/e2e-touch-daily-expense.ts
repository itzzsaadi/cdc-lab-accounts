/**
 * Playwright e2e fixture helper — NOT part of the Next.js app, never
 * compiled into the production route table. Run only via `tsx` (see
 * `scripts/e2e-create-user.ts`). Simulates "someone else edited this row"
 * for a stale-write test: finds a `daily_expenses` row by its
 * `custom_description` marker and bumps its `amount`/`updated_at` via a
 * direct Prisma update — deliberately bypassing the app's own mutation
 * (and its audit write), since this script's only job is to move the
 * row's `updated_at` out from under a test's already-open edit form, the
 * same way a second user's concurrent edit would.
 */
import "dotenv/config";
import { prisma } from "../src/server/prisma";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("e2e-touch-daily-expense must never run with NODE_ENV=production.");
  }

  const descriptionFlag = process.argv.indexOf("--description");
  const amountFlag = process.argv.indexOf("--amount");
  const description = descriptionFlag !== -1 ? process.argv[descriptionFlag + 1] : undefined;
  const amount = amountFlag !== -1 ? process.argv[amountFlag + 1] : undefined;
  if (!description || !amount) {
    throw new Error(
      "Usage: tsx scripts/e2e-touch-daily-expense.ts --description <marker> --amount <amount>",
    );
  }

  const row = await prisma.dailyExpense.findFirstOrThrow({
    where: { customDescription: description },
  });
  const updated = await prisma.dailyExpense.update({
    where: { id: row.id },
    data: { amount, updatedAt: new Date() },
  });

  process.stdout.write(JSON.stringify({ id: updated.id, updatedAt: updated.updatedAt }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
