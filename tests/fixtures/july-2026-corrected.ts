import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { configurePartnerMapping } from "../../src/server/mutations/app-settings";

/**
 * The July 2026 reconciliation fixture (CLAUDE.md §21, ADR-0007) — built
 * against the **corrected, single-AT-WASTE** interpretation of SRS
 * Appendix A.2/A.3 (SRS §11.3: "It is one fixed monthly bill, not two"),
 * per the approved resolution of the AT WASTE discrepancy documented in
 * CLAUDE.md §27 item 1 and ADR-0007. This is deliberately **not** the
 * uncorrected duplicate-AT-WASTE figure AC-02's prose literally states
 * (Rs 1,295,459 / Rs 200,076) — that figure only arises from double-
 * counting the one AT WASTE bill, which SRS §11.3 itself calls an error.
 *
 * Every category amount below is taken directly from SRS Appendix
 * A.2/A.3, funding BUSINESS throughout (Appendix A records no
 * partner-funded July line), so the administration/purchasing/daily
 * subtotals reconcile to the same figures a reader can re-derive from the
 * SRS appendix by hand. Income has no equivalent per-party breakdown in
 * the SRS beyond the two headline figures this fixture must reproduce
 * (total income, daily-billing party income) — the split between counter
 * income and monthly-billing party income is therefore this fixture's own
 * reasonable choice, not sourced from the SRS, since nothing in the
 * required reconciliation depends on that particular split.
 *
 * Never seeded into `prisma/seed.ts` or any real environment — this
 * fixture exists only for the Vitest reconciliation test that imports it.
 */
export const JULY_2026_CORRECTED_EXPECTED = {
  totalIncome: "1495535",
  totalExpenses: "1287459",
  netResult: "208076",
  partnerShareEach: "104038",
  dailyExpenseTotal: "171190",
  dailyBillingPartyIncome: "225650",
} as const;

const PERIOD_MONTH = new Date("2026-07-01");

const ADMIN_CATEGORIES: [string, string][] = [
  ["STAFF PAY 1", "18000"],
  ["STAFF PAY 2", "18000"],
  ["STAFF PAY 3", "20000"],
  ["TECHNOLOGIST PAY 1", "55000"],
  ["TECHNOLOGIST PAY 2", "45000"],
  ["PATHOLOGIST PAY", "40000"],
  ["SWEEPER PAY", "9000"],
  ["UTILITY BILL", "62000"],
  ["AT WASTE", "8000"], // SRS §11.3: one line, not two — the corrected interpretation.
  ["NET CHARGES", "3200"],
  ["SOFTWARE CHARGES", "3000"],
  ["CDC LAB LAHORE BILL", "341719"],
  ["RENT LAB", "50000"],
  ["COURIER", "20000"],
  // SECURITY FEE (Rs 0 in Appendix A.2) is omitted — it contributes
  // nothing to the reconciled total and a zero-amount line has no
  // reconciliation value here.
];

const PURCHASING_LINES: [string, string][] = [
  ["REHMAN TRADERS", "20000"],
  ["NATIONAL DIAGNOSTICS", "20000"],
  ["DATA DIAGNOSTICS", "32000"],
  ["DATA DIAGNOSTICS INST", "50000"],
  ["LAB MEDIKAL SOL INST", "100000"],
  ["ZYNOTIC DIAGNO INST", "100000"],
  ["PERFECT MEDICAL SYS", "101350"],
  // LAB MEDIKAL SOL and ZYNOTIC DIAGNOSTICS carry no July price ("—" in
  // Appendix A.3) — omitted, not zeroed, matching the appendix literally.
];

const DAILY_BILLING_PARTIES: [string, string][] = [
  ["GIVE LAB", "60000"],
  ["BEST LAB", "60000"],
  ["ACCURATE LAB", "55650"],
  ["SHAHADAT LAB", "50000"],
];

export interface July2026FixtureIds {
  partnerAUserId: string;
  partnerBUserId: string;
}

/** Builds the fixture inside the given (test) database and returns the two configured partner ids. */
export async function seedJuly2026CorrectedFixture(
  prisma: PrismaClient,
): Promise<July2026FixtureIds> {
  const admin = await prisma.user.create({
    data: {
      fullName: "Fixture Admin",
      email: `fixture-admin-${randomUUID()}@example.test`,
      role: "ADMIN",
      isPartner: true,
    },
  });
  const partnerA = await prisma.user.create({
    data: {
      fullName: "Partner One",
      email: `fixture-partner-a-${randomUUID()}@example.test`,
      role: "ADMIN",
      isPartner: true,
    },
  });
  const partnerB = await prisma.user.create({
    data: {
      fullName: "Partner Two",
      email: `fixture-partner-b-${randomUUID()}@example.test`,
      role: "PARTNER",
      isPartner: true,
    },
  });

  const mapping = await configurePartnerMapping(prisma, admin, {
    partnerAUserId: partnerA.id,
    partnerBUserId: partnerB.id,
  });
  if (!mapping.ok) {
    throw new Error(`Fixture setup failed to configure the partner mapping: ${mapping.error}`);
  }

  const actor = admin.id;

  for (const [name, amount] of ADMIN_CATEGORIES) {
    const category = await prisma.expenseCategory.create({
      data: { name, expenseGroup: "ADMIN" },
    });
    await prisma.monthlyExpense.create({
      data: {
        clientUuid: randomUUID(),
        periodMonth: PERIOD_MONTH,
        categoryId: category.id,
        amount,
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: actor,
        updatedBy: actor,
        updatedAt: new Date(),
      },
    });
  }

  for (const [name, amount] of PURCHASING_LINES) {
    const vendor = await prisma.vendor.create({ data: { name } });
    const category = await prisma.expenseCategory.create({
      data: { name, expenseGroup: "PURCHASING" },
    });
    await prisma.monthlyExpense.create({
      data: {
        clientUuid: randomUUID(),
        periodMonth: PERIOD_MONTH,
        categoryId: category.id,
        vendorId: vendor.id,
        amount,
        fundingSource: "BUSINESS",
        capturedAt: new Date(),
        createdBy: actor,
        updatedBy: actor,
        updatedAt: new Date(),
      },
    });
  }

  // Daily Expenses (system-generated line in the workbook) — Rs 171,190,
  // entirely business-funded, dated within July.
  await prisma.dailyExpense.create({
    data: {
      clientUuid: randomUUID(),
      expenseDate: new Date("2026-07-15"),
      customDescription: "July 2026 daily expenses (fixture total)",
      amount: JULY_2026_CORRECTED_EXPECTED.dailyExpenseTotal,
      fundingSource: "BUSINESS",
      capturedAt: new Date(),
      createdBy: actor,
      updatedBy: actor,
      updatedAt: new Date(),
    },
  });

  for (const [name, amount] of DAILY_BILLING_PARTIES) {
    const party = await prisma.party.create({ data: { name, billingMode: "DAILY", sortOrder: 1 } });
    await prisma.partyIncome.create({
      data: {
        clientUuid: randomUUID(),
        partyId: party.id,
        incomeDate: new Date("2026-07-10"),
        amount,
        receiptType: "DAILY",
        capturedAt: new Date(),
        createdBy: actor,
        updatedBy: actor,
        updatedAt: new Date(),
      },
    });
  }

  // Monthly-billing party income — Rs 1,000,000, no per-party breakdown
  // given in the SRS beyond the headline totals this fixture reproduces.
  const monthlyPartyA = await prisma.party.create({
    data: { name: "Fixture Monthly Party 1", billingMode: "MONTHLY", sortOrder: 1 },
  });
  const monthlyPartyB = await prisma.party.create({
    data: { name: "Fixture Monthly Party 2", billingMode: "MONTHLY", sortOrder: 2 },
  });
  await prisma.partyIncome.create({
    data: {
      clientUuid: randomUUID(),
      partyId: monthlyPartyA.id,
      incomeDate: PERIOD_MONTH,
      amount: "600000",
      receiptType: "MONTHLY",
      capturedAt: new Date(),
      createdBy: actor,
      updatedBy: actor,
      updatedAt: new Date(),
    },
  });
  await prisma.partyIncome.create({
    data: {
      clientUuid: randomUUID(),
      partyId: monthlyPartyB.id,
      incomeDate: PERIOD_MONTH,
      amount: "400000",
      receiptType: "MONTHLY",
      capturedAt: new Date(),
      createdBy: actor,
      updatedBy: actor,
      updatedAt: new Date(),
    },
  });

  // Counter income — Rs 269,885, no per-day breakdown given in the SRS.
  await prisma.counterIncome.create({
    data: {
      clientUuid: randomUUID(),
      incomeDate: new Date("2026-07-05"),
      amount: "200000",
      capturedAt: new Date(),
      createdBy: actor,
      updatedBy: actor,
      updatedAt: new Date(),
    },
  });
  await prisma.counterIncome.create({
    data: {
      clientUuid: randomUUID(),
      incomeDate: new Date("2026-07-20"),
      amount: "69885",
      capturedAt: new Date(),
      createdBy: actor,
      updatedBy: actor,
      updatedAt: new Date(),
    },
  });

  return { partnerAUserId: partnerA.id, partnerBUserId: partnerB.id };
}
