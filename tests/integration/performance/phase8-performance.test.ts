import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestParty, createTestExpenseItem } from "../helpers/fixtures";
import type { AuthenticatedUser } from "../../../src/lib/permissions/guard";
import { listDailyExpenses } from "../../../src/server/queries/daily-expenses";
import {
  getPartyIncomeGrid,
  getPartyIncomeReport,
  getPartyMonthlyTotals,
} from "../../../src/server/queries/party-income";
import { listCounterIncome } from "../../../src/server/queries/counter-income";
import { listRecentEntries } from "../../../src/server/queries/home";
import { listMonthlyExpenses } from "../../../src/server/queries/monthly-expenses";
import { listAssets } from "../../../src/server/queries/assets";
import { listAuditActors, listAuditLog } from "../../../src/server/queries/audit-log";
import { getPartnerInvestmentStatements } from "../../../src/server/queries/capital-contributions";
import { getDashboardTrend } from "../../../src/server/queries/results";
import { getDashboardWarnings } from "../../../src/server/queries/warnings";
import { processSyncBatch } from "../../../src/server/sync/upload";
import type { IncomingSyncOperation } from "../../../src/server/sync/apply";

const prisma = getTestPrismaClient();

afterAll(async () => {
  await resetDatabase();
});

/**
 * Phase 8A. Phase 5 already proved NFR-PERF-04/05 (result calculation,
 * report export) against a three-year dataset. This file closes the two
 * remaining measurable budgets:
 *
 * - **NFR-PERF-06** — "screens stay within limits with three years of
 *   accumulated data" — extended from the two result/report queries Phase
 *   5 covered to *every* list and grid screen, which is what the
 *   requirement actually says.
 * - **NFR-PERF-07** — "200 offline entries upload within 30 seconds" —
 *   driven through the real `processSyncBatch`, in the same 50-per-batch
 *   chunks the client uses.
 *
 * **NFR-PERF-01/02/03 are deliberately not asserted here.** They are
 * browser-timing budgets (load ≤5s, navigation ≤1s, save confirm ≤2s) and
 * Playwright runs against `next dev`, where first-hit Turbopack
 * compilation dominates every measurement and would make any number
 * recorded here meaningless — favourable or unfavourable. They need a
 * production build served by `next start`, which is a Phase 8B
 * deployment-environment measurement. Recorded as outstanding rather than
 * asserted against a figure that would not mean what it appears to.
 */

/** Same three-year window Phase 5's fixture uses, so both measure the same shape of data. */
const RANGE_START = new Date("2023-08-01");
const RANGE_END = new Date("2026-07-31");

function daysInclusive(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

/** Generous relative to the SRS's own 3s result budget (NFR-PERF-04) — a list screen does strictly less work than a full result calculation, so anything approaching this is a real regression. */
const SCREEN_BUDGET_MS = 3000;

async function timed<T>(work: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await work();
  return { ms: performance.now() - started, value };
}

describe("Phase 8A performance — every screen at three years of data (NFR-PERF-06)", () => {
  let partner: AuthenticatedUser;
  let dailyPartyId: string;

  beforeAll(async () => {
    await resetDatabase();
    const actor = await createTestUser({ role: "ADMIN", isPartner: true });
    partner = { id: actor.id, role: "ADMIN", isPartner: true, isActive: true };

    const days = daysInclusive(RANGE_START, RANGE_END);
    const dailyParties = await Promise.all(
      Array.from({ length: 4 }, () => createTestParty({ billingMode: "DAILY" })),
    );
    dailyPartyId = dailyParties[0]!.id;
    const item = await createTestExpenseItem();
    const now = new Date();

    // Bulk `createMany` only — a per-row insert loop over ~10,000 rows
    // would make the seed itself the slowest thing in the suite.
    await prisma.dailyExpense.createMany({
      data: days.flatMap((day) =>
        Array.from({ length: 3 }, () => ({
          clientUuid: randomUUID(),
          expenseDate: day,
          expenseItemId: item.id,
          amount: "250.00",
          fundingSource: "BUSINESS" as const,
          capturedAt: now,
          createdBy: actor.id,
          updatedBy: actor.id,
          updatedAt: now,
        })),
      ),
    });

    await prisma.partyIncome.createMany({
      data: days.flatMap((day) =>
        dailyParties.map((party) => ({
          clientUuid: randomUUID(),
          partyId: party.id,
          incomeDate: day,
          amount: "1500.00",
          receiptType: "DAILY" as const,
          capturedAt: now,
          createdBy: actor.id,
          updatedBy: actor.id,
          updatedAt: now,
        })),
      ),
    });

    await prisma.counterIncome.createMany({
      data: days.map((day) => ({
        clientUuid: randomUUID(),
        incomeDate: day,
        amount: "3000.00",
        capturedAt: now,
        createdBy: actor.id,
        updatedBy: actor.id,
        updatedAt: now,
      })),
    });

    // Audit rows dominate the Change History screen more than any business
    // table, so seed them at a realistic multiple.
    await prisma.auditLog.createMany({
      data: Array.from({ length: 5000 }, (_, i) => ({
        actorUserId: actor.id,
        action: "CREATE" as const,
        entityType: "daily_expense",
        entityId: randomUUID(),
        newValues: { seq: i },
        capturedAt: now,
      })),
    });
  }, 180_000);

  it("Daily Expenses list stays within budget", async () => {
    const { ms } = await timed(() =>
      listDailyExpenses(prisma, partner, { from: "2026-07-01", to: "2026-07-31" }),
    );
    expect(ms, `listDailyExpenses took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });

  it("Party Income grid stays within budget", async () => {
    const { ms } = await timed(() => getPartyIncomeGrid(prisma, partner, "2026-07"));
    expect(ms, `getPartyIncomeGrid took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
    expect(dailyPartyId).toBeTruthy();
  });

  it("Monthly Party Bills list stays within budget", async () => {
    const { ms } = await timed(() => getPartyMonthlyTotals(prisma, partner, "2026-07"));
    expect(ms, `getPartyMonthlyTotals took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });

  it("Income by Party report stays within budget across the full three-year range", async () => {
    const { ms } = await timed(() =>
      getPartyIncomeReport(prisma, partner, { from: "2023-08-01", to: "2026-07-31" }),
    );
    expect(ms, `getPartyIncomeReport took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });

  it("Counter Income list stays within budget", async () => {
    const { ms } = await timed(() =>
      listCounterIncome(prisma, partner, { from: "2026-07-01", to: "2026-07-31" }),
    );
    expect(ms, `listCounterIncome took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });

  it("Operator Home recent entries stay within budget", async () => {
    const { ms } = await timed(() => listRecentEntries(prisma, partner));
    expect(ms, `listRecentEntries took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });

  it("Monthly Expenses list stays within budget", async () => {
    const { ms } = await timed(() => listMonthlyExpenses(prisma, partner, "2026-07"));
    expect(ms, `listMonthlyExpenses took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });

  it("Asset Register stays within budget", async () => {
    const { ms } = await timed(() => listAssets(prisma, partner, {}));
    expect(ms, `listAssets took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });

  it("Investment statement stays within budget", async () => {
    const { ms } = await timed(() => getPartnerInvestmentStatements(prisma, partner));
    expect(ms, `getPartnerInvestmentStatements took ${ms.toFixed(0)}ms`).toBeLessThan(
      SCREEN_BUDGET_MS,
    );
  });

  it("Audit Log first page stays within budget against 5,000 rows (keyset pagination, never OFFSET)", async () => {
    const { ms } = await timed(() =>
      Promise.all([listAuditLog(prisma, partner, {}), listAuditActors(prisma, partner)]),
    );
    expect(ms, `Audit Log queries took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });

  it("Dashboard trend and warnings stay within budget", async () => {
    const { ms } = await timed(() =>
      Promise.all([
        getDashboardTrend(prisma, partner, "2026-07"),
        getDashboardWarnings(prisma, partner, "2026-07"),
      ]),
    );
    expect(ms, `Dashboard queries took ${ms.toFixed(0)}ms`).toBeLessThan(SCREEN_BUDGET_MS);
  });
});

describe("Phase 8A performance — offline upload throughput (NFR-PERF-07)", () => {
  it("uploads 200 queued entries within 30 seconds, in the client's own 50-per-batch chunks", async () => {
    await resetDatabase();
    const actor = await createTestUser({ role: "OPERATOR" });
    const item = await createTestExpenseItem();

    const operations: IncomingSyncOperation[] = Array.from({ length: 200 }, (_, i) => ({
      operationId: randomUUID(),
      entityType: "daily_expense",
      action: "CREATE",
      clientUuid: randomUUID(),
      capturedAt: new Date().toISOString(),
      payload: {
        clientUuid: randomUUID(),
        expenseDate: "2026-07-15",
        expenseItemId: item.id,
        amount: String(100 + i),
        fundingSource: "BUSINESS",
      },
    })) as IncomingSyncOperation[];

    const started = performance.now();
    // Chunked exactly as the client does — the API caps a batch at 50, so
    // measuring one 200-operation call would test something the system
    // never actually does.
    for (let offset = 0; offset < operations.length; offset += 50) {
      await processSyncBatch(prisma, actor.id, operations.slice(offset, offset + 50));
    }
    const elapsed = performance.now() - started;

    expect(await prisma.dailyExpense.count()).toBe(200);
    expect(elapsed, `200 entries took ${(elapsed / 1000).toFixed(1)}s`).toBeLessThan(30_000);
  }, 60_000);
});
