import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { hasAtLeastRole } from "../../../../lib/permissions/roles";
import { listCounterIncome } from "../../../../server/queries/counter-income";
import { monthBounds, currentYearMonthInKarachi } from "../../../../lib/domain/calendar-date";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { CounterIncomeForm } from "../../../../components/entries/CounterIncomeForm";
import { HistoryButton } from "../../../../components/entries/HistoryButton";

export default async function CounterIncomePage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "entry:counter-income");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const { firstDay, lastDay } = monthBounds(currentYearMonthInKarachi());
  const { items, total } = await listCounterIncome(prisma, user, { from: firstDay, to: lastDay });
  const canViewHistory = hasAtLeastRole(user!.role, "PARTNER");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-display-lg text-on-background font-bold">Counter Income</h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          Walk-in patient income, recorded once per day.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
          {items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No counter income recorded this month"
                description="Use the form to record the first entry."
              />
            </div>
          ) : (
            <>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Date</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Note</Th>
                    {canViewHistory ? <Th className="text-right">History</Th> : null}
                  </Tr>
                </Thead>
                <Tbody>
                  {items.map((item) => (
                    <Tr key={item.id}>
                      <Td className="whitespace-nowrap">
                        {item.incomeDate.toISOString().slice(0, 10)}
                      </Td>
                      <Td className="tabular-nums text-right">{formatMoney(item.amount)}</Td>
                      <Td className="text-on-surface-variant">{item.note ?? ""}</Td>
                      {canViewHistory ? (
                        <Td className="text-right">
                          <HistoryButton
                            entityType="counter_income"
                            entityId={item.id}
                            displayLabel={`Counter Income ${item.incomeDate.toISOString().slice(0, 10)}`}
                          />
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-between border-t p-4">
                <span className="text-on-surface-variant text-sm">
                  {items.length} {items.length === 1 ? "entry" : "entries"}
                </span>
                <span className="tabular-nums text-on-surface font-semibold">
                  Total: {formatMoney(total)}
                </span>
              </div>
            </>
          )}
        </div>
        <CounterIncomeForm />
      </div>
    </div>
  );
}
