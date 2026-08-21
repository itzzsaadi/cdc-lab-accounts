import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { getPartyMonthlyTotals } from "../../../../server/queries/party-income";
import { currentYearMonthInKarachi } from "../../../../lib/domain/calendar-date";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { MonthlyPartyBillRow } from "../../../../components/entries/MonthlyPartyBillRow";
import { Decimal, ZERO } from "../../../../lib/domain/money";

/** FR-PINC-03 (Partner-only, UC-07) — one figure per monthly-billing party per month, completing FR-PINC-07/08's three-way total (daily + monthly + cash receipts) for monthly-billing parties. */
export default async function MonthlyPartyBillPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "party-income:monthly-bill");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const rawMonth = (await searchParams).month;
  const periodMonth =
    rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentYearMonthInKarachi();

  const totals = await getPartyMonthlyTotals(prisma, user, periodMonth);
  const monthlyBillingParties = totals.filter((t) => t.billingMode === "MONTHLY");

  const grandTotal = monthlyBillingParties.reduce<Decimal>(
    (sum, row) => sum.plus(row.monthlyBill?.amount ?? "0").plus(row.cashReceiptsTotal),
    ZERO,
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display-lg text-on-background font-bold">Monthly Party Bills</h1>
        <p className="text-on-surface-variant mt-1 text-sm">{periodMonth}</p>
      </div>

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
        {monthlyBillingParties.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No monthly-billing parties"
              description="Monthly-billing parties are managed in master data."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Party</Th>
                  <Th className="text-right">Cash Receipts</Th>
                  <Th>Monthly Bill</Th>
                  <Th className="text-right">Combined Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {monthlyBillingParties.map((row) => (
                  <Tr key={row.partyId}>
                    <Td className="font-medium">
                      {row.name}
                      {!row.isActive ? (
                        <span className="text-on-surface-variant ml-1 text-xs">(archived)</span>
                      ) : null}
                    </Td>
                    <Td className="tabular-nums text-right">
                      {formatMoney(row.cashReceiptsTotal)}
                    </Td>
                    <Td>
                      <MonthlyPartyBillRow
                        row={{
                          partyId: row.partyId,
                          partyName: row.name,
                          periodMonth,
                          existing: row.monthlyBill,
                        }}
                      />
                    </Td>
                    <Td className="tabular-nums text-right">{formatMoney(row.combinedTotal)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
        <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-end border-t p-4">
          <span className="tabular-nums text-on-surface font-semibold">
            Grand Total: {formatMoney(grandTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
