import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import {
  listDailyExpenses,
  listActiveExpenseItems,
} from "../../../../server/queries/daily-expenses";
import { monthBounds, currentYearMonthInKarachi } from "../../../../lib/domain/calendar-date";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { DailyExpenseDrawer } from "../../../../components/entries/DailyExpenseDrawer";

export default async function DailyExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "entry:daily-expense");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const params = await searchParams;
  const { firstDay, lastDay } = monthBounds(currentYearMonthInKarachi());
  const from = params.from ?? firstDay;
  const to = params.to ?? lastDay;

  const [{ items, total }, expenseItems, partners] = await Promise.all([
    listDailyExpenses(prisma, user, { from, to }),
    listActiveExpenseItems(prisma),
    prisma.user.findMany({
      where: { isPartner: true, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <div>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-display-lg text-on-background font-bold">Daily Expenses</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Operational costs recorded day by day.
          </p>
        </div>
        <DailyExpenseDrawer
          expenseItems={expenseItems}
          partners={partners.map((p) => ({ id: p.id, fullName: p.fullName }))}
        />
      </div>

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
        {items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No daily expenses recorded for this range"
              description="Use Add Expense to record the first one."
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Item</Th>
                    <Th className="text-right">Amount (PKR)</Th>
                    <Th>Funding Source</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {items.map((item) => (
                    <Tr key={item.id}>
                      <Td className="whitespace-nowrap">
                        {item.expenseDate.toISOString().slice(0, 10)}
                      </Td>
                      <Td className="font-medium">
                        {item.expenseItem?.name ?? item.customDescription}
                        {item.expenseItem && !item.expenseItem.isActive ? (
                          <span className="text-on-surface-variant ml-1 text-xs">(archived)</span>
                        ) : null}
                      </Td>
                      <Td className="tabular-nums text-right">{item.amount.toString()}</Td>
                      <Td>
                        {item.fundingSource === "BUSINESS"
                          ? "Business"
                          : `Partner: ${item.fundedBy?.fullName ?? "Unknown"}`}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
            <div className="divide-outline-variant/50 divide-y md:hidden">
              {items.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-on-surface font-medium break-words">
                        {item.expenseItem?.name ?? item.customDescription}
                      </h3>
                      <p className="text-on-surface-variant mt-0.5 text-sm">
                        {item.expenseDate.toISOString().slice(0, 10)}
                      </p>
                    </div>
                    <span className="tabular-nums text-on-surface shrink-0 font-semibold">
                      {item.amount.toString()} PKR
                    </span>
                  </div>
                  <span className="text-on-surface-variant text-sm">
                    {item.fundingSource === "BUSINESS"
                      ? "Business"
                      : `Partner: ${item.fundedBy?.fullName ?? "Unknown"}`}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-between border-t p-4">
              <span className="text-on-surface-variant text-sm">
                {items.length} {items.length === 1 ? "entry" : "entries"}
              </span>
              <span className="tabular-nums text-on-surface font-semibold">
                Total: {total.toString()} PKR
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
