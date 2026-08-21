/**
 * Playwright e2e fixture helper — NOT part of the Next.js app (nothing
 * under `src/app`), never compiled into the production route table. Run
 * only via `tsx` (see `scripts/e2e-create-user.ts` for why: Playwright's
 * own TypeScript transform cannot load the generated Prisma client's ESM
 * `import.meta`).
 *
 * Looks up a `party_income` row by its `note` (a test-generated random
 * marker, unique enough in practice to identify one row) and prints
 * `{ found, receiptType, amount, auditCount }` as JSON — the DB-level
 * proof a Playwright browser test cannot otherwise reach (no test-only
 * HTTP route exists in this app, per the Phase 2 closure decision).
 */
import "dotenv/config";
import { prisma } from "../src/server/prisma";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("e2e-verify-party-income-row must never run with NODE_ENV=production.");
  }

  const noteFlag = process.argv.indexOf("--note");
  const note = noteFlag !== -1 ? process.argv[noteFlag + 1] : undefined;
  if (!note) {
    throw new Error("Usage: tsx scripts/e2e-verify-party-income-row.ts --note <note>");
  }

  const row = await prisma.partyIncome.findFirst({ where: { note } });
  if (!row) {
    process.stdout.write(JSON.stringify({ found: false }));
    return;
  }

  const auditCount = await prisma.auditLog.count({
    where: { entityType: "party_income", entityId: row.id },
  });

  process.stdout.write(
    JSON.stringify({
      found: true,
      receiptType: row.receiptType,
      amount: row.amount.toString(),
      auditCount,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
