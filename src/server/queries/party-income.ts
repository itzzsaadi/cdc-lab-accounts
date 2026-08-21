import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { daysInMonth, monthBounds, parseCalendarDate } from "../../lib/domain/calendar-date";
import { Decimal, ZERO } from "../../lib/domain/money";

export interface PartyIncomeGridCell {
  id: string;
  amount: string;
  updatedAt: string;
}

export interface PartyIncomeGridParty {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PartyIncomeGrid {
  yearMonth: string;
  days: string[];
  parties: PartyIncomeGridParty[];
  cells: Record<string, Record<string, PartyIncomeGridCell | null>>;
  partyTotals: Record<string, string>;
  dayTotals: Record<string, string>;
  grandTotal: string;
}

/**
 * FR-PINC-02/07/08/09. Columns are every currently-active daily-billing
 * party, *plus* any daily-billing party that has been archived
 * (`is_active = false`) but still has at least one non-archived DAILY row
 * within the selected month (mandatory safeguard #6 — archived-party
 * historical visibility). The caller renders an archived party's column as
 * read-only using each returned party's `isActive` flag; this query itself
 * never omits that history.
 */
export async function getPartyIncomeGrid(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  yearMonth: string,
): Promise<PartyIncomeGrid> {
  requirePermission(currentUser, "entry:party-income");

  const { firstDay, lastDay } = monthBounds(yearMonth);
  const from = parseCalendarDate(firstDay)!;
  const to = parseCalendarDate(lastDay)!;

  const rows = await prisma.partyIncome.findMany({
    where: {
      receiptType: "DAILY",
      isArchived: false,
      incomeDate: { gte: from, lte: to },
    },
    select: { id: true, partyId: true, incomeDate: true, amount: true, updatedAt: true },
  });

  const historicalPartyIds = new Set(rows.map((row) => row.partyId));

  const activeParties = await prisma.party.findMany({
    where: { billingMode: "DAILY", isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const archivedButHistorical = await prisma.party.findMany({
    where: {
      billingMode: "DAILY",
      isActive: false,
      id: { in: Array.from(historicalPartyIds) },
    },
    orderBy: { sortOrder: "asc" },
  });

  const parties: PartyIncomeGridParty[] = [...activeParties, ...archivedButHistorical].map(
    (party) => ({ id: party.id, name: party.name, isActive: party.isActive }),
  );

  const days = daysInMonth(yearMonth);
  const cells: PartyIncomeGrid["cells"] = {};
  const partyTotals: Record<string, Decimal> = {};
  const dayTotals: Record<string, Decimal> = {};
  for (const party of parties) {
    cells[party.id] = {};
    for (const day of days) {
      cells[party.id][day] = null;
    }
    partyTotals[party.id] = ZERO;
  }
  for (const day of days) {
    dayTotals[day] = ZERO;
  }

  let grandTotal = ZERO;
  for (const row of rows) {
    const day = row.incomeDate.toISOString().slice(0, 10);
    if (!cells[row.partyId]) continue; // defensive — party filtered out for another reason
    cells[row.partyId][day] = {
      id: row.id,
      amount: row.amount.toString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    partyTotals[row.partyId] = partyTotals[row.partyId].plus(row.amount);
    dayTotals[day] = dayTotals[day].plus(row.amount);
    grandTotal = grandTotal.plus(row.amount);
  }

  return {
    yearMonth,
    days,
    parties,
    cells,
    partyTotals: Object.fromEntries(
      Object.entries(partyTotals).map(([id, total]) => [id, total.toString()]),
    ),
    dayTotals: Object.fromEntries(
      Object.entries(dayTotals).map(([day, total]) => [day, total.toString()]),
    ),
    grandTotal: grandTotal.toString(),
  };
}

/** Active parties (either billing mode) for the Cash Receipt party picker — FR-PINC-06 records a direct cash receipt "against a party" with no billing-mode restriction, unlike the grid, which is daily-billing parties only. */
export async function listActivePartiesForCashReceipt(prisma: PrismaClient) {
  return prisma.party.findMany({
    where: { isActive: true },
    orderBy: [{ billingMode: "asc" }, { sortOrder: "asc" }],
  });
}

export interface PartyMonthlyTotal {
  partyId: string;
  name: string;
  isActive: boolean;
  billingMode: "DAILY" | "MONTHLY";
  dailyTotal: string;
  monthlyBill: { id: string; amount: string; updatedAt: string } | null;
  cashReceiptsTotal: string;
  combinedTotal: string;
}

/**
 * FR-PINC-07/08 (Phase 4 completion): the full three-way per-party total —
 * daily entries + the monthly bill figure (FR-PINC-03, Partner-only) + cash
 * receipts — for whichever components apply to that party's billing mode.
 * A daily-billing party never has a monthly bill; a monthly-billing party
 * never has daily grid rows; every party can carry `CASH_DIRECT` receipts
 * regardless of mode (FR-PINC-06). Reused by both the Monthly Party Bill
 * screen (filtered to `billingMode: "MONTHLY"`) and anywhere the complete
 * combined total is needed. Archived-but-historical parties with a live row
 * this month are still included (mandatory safeguard #6, same as the grid).
 */
export async function getPartyMonthlyTotals(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  yearMonth: string,
): Promise<PartyMonthlyTotal[]> {
  requirePermission(currentUser, "entry:party-income");

  const { firstDay, lastDay } = monthBounds(yearMonth);
  const from = parseCalendarDate(firstDay)!;
  const to = parseCalendarDate(lastDay)!;

  const rows = await prisma.partyIncome.findMany({
    where: { isArchived: false, incomeDate: { gte: from, lte: to } },
    select: { id: true, partyId: true, amount: true, receiptType: true, updatedAt: true },
  });

  const historicalPartyIds = new Set(rows.map((row) => row.partyId));
  const activeParties = await prisma.party.findMany({
    where: { isActive: true },
    orderBy: [{ billingMode: "asc" }, { sortOrder: "asc" }],
  });
  const archivedButHistorical = await prisma.party.findMany({
    where: { isActive: false, id: { in: Array.from(historicalPartyIds) } },
    orderBy: [{ billingMode: "asc" }, { sortOrder: "asc" }],
  });
  const parties = [...activeParties, ...archivedButHistorical];

  return parties.map((party) => {
    const partyRows = rows.filter((row) => row.partyId === party.id);
    const dailyTotal = partyRows
      .filter((row) => row.receiptType === "DAILY")
      .reduce<Decimal>((sum, row) => sum.plus(row.amount), ZERO);
    const cashReceiptsTotal = partyRows
      .filter((row) => row.receiptType === "CASH_DIRECT")
      .reduce<Decimal>((sum, row) => sum.plus(row.amount), ZERO);
    const monthlyRow = partyRows.find((row) => row.receiptType === "MONTHLY") ?? null;
    const monthlyAmount = monthlyRow ? monthlyRow.amount : ZERO;

    return {
      partyId: party.id,
      name: party.name,
      isActive: party.isActive,
      billingMode: party.billingMode,
      dailyTotal: dailyTotal.toString(),
      monthlyBill: monthlyRow
        ? {
            id: monthlyRow.id,
            amount: monthlyRow.amount.toString(),
            updatedAt: monthlyRow.updatedAt.toISOString(),
          }
        : null,
      cashReceiptsTotal: cashReceiptsTotal.toString(),
      combinedTotal: dailyTotal.plus(monthlyAmount).plus(cashReceiptsTotal).toString(),
    };
  });
}
