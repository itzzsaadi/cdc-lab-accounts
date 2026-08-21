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
