import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import {
  createTestUser,
  createTestExpenseCategory,
  createTestDailyExpense,
} from "../helpers/fixtures";
import { getPartnerInvestmentStatements } from "../../../src/server/queries/capital-contributions";
import { createCapitalContribution } from "../../../src/server/mutations/capital-contributions";
import { createAsset } from "../../../src/server/mutations/assets";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

/** FR-INV-01/02/05, BR-06/BR-08/BR-11 — the investment statement never affects the profit split (this query takes no split input at all). */
describe("getPartnerInvestmentStatements", () => {
  it("combines capital contributions, partner-funded expenses, and cash assets into one running total", async () => {
    const user = await partnerUser();

    await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-01",
      amount: "20000",
      contributionType: "INJECTION",
    });
    await createTestDailyExpense({
      userId: user.id,
      amount: "3000",
      fundingSource: "PARTNER",
      fundedByUserId: user.id,
    });
    await createAsset(prisma, user, {
      name: "Cash-bought Centrifuge",
      classification: "MOVABLE",
      acquisitionMode: "CASH",
      purchasePrice: "100000",
      purchasedByUserId: user.id,
    });

    const statements = await getPartnerInvestmentStatements(prisma, user);
    const statement = statements.find((s) => s.partnerId === user.id)!;
    expect(statement.total).toBe("123000"); // 20000 + 3000 + 100000
    expect(statement.items).toHaveLength(3);
  });

  it("a DRAWING reduces the running total without ever being stored as a negative Decimal", async () => {
    const user = await partnerUser();
    await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-01",
      amount: "20000",
      contributionType: "INJECTION",
    });
    await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-10",
      amount: "5000",
      contributionType: "DRAWING",
    });

    const rows = await prisma.capitalContribution.findMany({ where: { partnerUserId: user.id } });
    expect(rows.every((r) => r.amount.greaterThan(0))).toBe(true);

    const statements = await getPartnerInvestmentStatements(prisma, user);
    const statement = statements.find((s) => s.partnerId === user.id)!;
    expect(statement.total).toBe("15000");
  });
});
