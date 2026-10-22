import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { getPartyIncomeReport } from "../../../../server/queries/party-income";
import {
  currentYearMonthInKarachi,
  monthBounds,
  parseCustomDateRange,
} from "../../../../lib/domain/calendar-date";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { InfoTip } from "../../../../components/ui/InfoTip";
import { DateRangeFilter } from "../../../../components/filters/DateRangeFilter";

/** FR-RPT-05/FR-PINC-08: income by party across any user-chosen date range, defaulting to the current calendar month. Partner/Admin-only (report:financial-summary) — never reachable by an Operator, through the UI or a direct request. */
export default async function PartyIncomeReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "report:financial-summary");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const params = await searchParams;
  let range: { from: string; to: string };
  if (params.from && params.to) {
    const parsed = parseCustomDateRange(params.from, params.to);
    if (parsed) {
      range = parsed;
    } else {
      const bounds = monthBounds(currentYearMonthInKarachi());
      range = { from: bounds.firstDay, to: bounds.lastDay };
    }
  } else {
    const bounds = monthBounds(currentYearMonthInKarachi());
    range = { from: bounds.firstDay, to: bounds.lastDay };
  }

  const currentParams: Record<string, string | undefined> = {
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  };

  const report = await getPartyIncomeReport(prisma, user, range);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display-lg text-on-background font-bold">Income by Party</h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          {report.from} to {report.to}
        </p>
      </div>

      <DateRangeFilter currentParams={currentParams} from={range.from} to={range.to} />

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
        {report.parties.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No parties recorded yet"
              description="Income by party will appear once a party exists."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Party</Th>
                    <Th>Billing Mode</Th>
                    <Th className="text-right">Daily</Th>
                    <Th className="text-right">Monthly</Th>
                    <Th className="text-right">Cash Receipts</Th>
                    <Th className="text-right">Combined Total</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {report.parties.map((party) => (
                    <Tr key={party.partyId}>
                      <Td>
                        {party.name}
                        {!party.isActive ? (
                          <span className="text-on-surface-variant ml-1 text-xs">(archived)</span>
                        ) : null}
                      </Td>
                      <Td>{party.billingMode === "DAILY" ? "Daily billing" : "Monthly billing"}</Td>
                      <Td className="tabular-nums text-right">{formatMoney(party.dailyTotal)}</Td>
                      <Td className="tabular-nums text-right">{formatMoney(party.monthlyTotal)}</Td>
                      <Td className="tabular-nums text-right">
                        {formatMoney(party.cashReceiptsTotal)}
                      </Td>
                      <Td className="tabular-nums text-right font-semibold">
                        {formatMoney(party.combinedTotal)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
            <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-between border-t p-4">
              <span className="text-on-surface-variant text-sm">
                {report.parties.length} {report.parties.length === 1 ? "party" : "parties"}
              </span>
              <span className="tabular-nums text-on-surface font-semibold">
                Combined Total: {formatMoney(report.grandTotal)}{" "}
                <InfoTip>
                  Party totals combine three sources: Daily grid entries, Monthly bills, and Cash receipts.
                </InfoTip>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
