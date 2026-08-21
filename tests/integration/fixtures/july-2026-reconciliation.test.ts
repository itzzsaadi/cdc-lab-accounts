import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import {
  seedJuly2026CorrectedFixture,
  JULY_2026_CORRECTED_EXPECTED,
} from "../../fixtures/july-2026-corrected";
import { computeMonthlyResultTotals } from "../../../src/server/queries/results";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

/**
 * CLAUDE.md §21 / ADR-0007: the single most important regression test in
 * the codebase. Reproduces the **corrected** (single-AT-WASTE) July 2026
 * figures exactly from a fixture of the underlying entries, through the
 * real `/lib/domain`-backed query layer — never a hand-computed
 * assertion. If this ever stops producing these exact figures from this
 * exact fixture, the result calculation itself is wrong and must be
 * fixed before any other Phase 5+ work proceeds (AC-02's spirit, applied
 * to the corrected figures approved in ADR-0007 rather than the
 * uncorrected duplicate-AT-WASTE prose in SRS §2.1/AC-02).
 */
describe("July 2026 reconciliation fixture (corrected, single AT WASTE)", () => {
  it("reproduces total income, total expenses, net result, and the 50/50 partner split exactly", async () => {
    await seedJuly2026CorrectedFixture(prisma);

    const totals = await computeMonthlyResultTotals(prisma, {
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(totals.totalIncome).toBe(JULY_2026_CORRECTED_EXPECTED.totalIncome);
    expect(totals.totalExpenses).toBe(JULY_2026_CORRECTED_EXPECTED.totalExpenses);
    expect(totals.netResult).toBe(JULY_2026_CORRECTED_EXPECTED.netResult);
    expect(totals.dailyExpenseBusinessTotal).toBe(JULY_2026_CORRECTED_EXPECTED.dailyExpenseTotal);

    expect(totals.split.isConfigured).toBe(true);
    expect(totals.split.shareA).toBe(JULY_2026_CORRECTED_EXPECTED.partnerShareEach);
    expect(totals.split.shareB).toBe(JULY_2026_CORRECTED_EXPECTED.partnerShareEach);
  });

  it("reproduces the daily-billing party income component exactly", async () => {
    await seedJuly2026CorrectedFixture(prisma);

    const dailyBillingTotal = await prisma.partyIncome.aggregate({
      _sum: { amount: true },
      where: {
        isArchived: false,
        receiptType: "DAILY",
        incomeDate: { gte: new Date("2026-07-01"), lte: new Date("2026-07-31") },
      },
    });

    expect((dailyBillingTotal._sum.amount ?? "0").toString()).toBe(
      JULY_2026_CORRECTED_EXPECTED.dailyBillingPartyIncome,
    );
  });
});
