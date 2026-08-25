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
import { formatMoney } from "../../../../lib/domain/money-format";
import { listDailyExpensesSchema } from "../../../../lib/validation/daily-expense";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { DailyExpenseDrawer } from "../../../../components/entries/DailyExpenseDrawer";
import { DailyExpenseRowActions } from "../../../../components/entries/DailyExpenseRowActions";
import { DailyExpenseFilters } from "../../../../components/filters/DailyExpenseFilters";

export default async function DailyExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
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

  const rawParams = await searchParams;
  // FR-DEXP-07: every filter value is validated server-side (NFR-SEC-05)
  // regardless of what the URL query string actually contains — an
  // invalid/malformed value is simply dropped, never thrown as an error,
  // since a filter is a refinement of the view, not a required input.
  const parsed = listDailyExpensesSchema.safeParse({
    from: rawParams.from || undefined,
    to: rawParams.to || undefined,
    expenseItemId: rawParams.expenseItemId || undefined,
    fundingSource: rawParams.fundingSource || undefined,
    search: rawParams.search || undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const { firstDay, lastDay } = monthBounds(currentYearMonthInKarachi());
  const from = filters.from ?? firstDay;
  const to = filters.to ?? lastDay;
  const filtersActive = Boolean(
    filters.from || filters.to || filters.fundingSource || filters.search,
  );

  const [{ items, total }, expenseItems, partners] = await Promise.all([
    listDailyExpenses(prisma, user, {
      from,
      to,
      fundingSource: filters.fundingSource,
      search: filters.search,
    }),
    listActiveExpenseItems(prisma),
    prisma.user.findMany({
      where: { isPartner: true, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const expenseItemOptions = expenseItems.map((item) => ({ id: item.id, name: item.name }));
  const partnerOptions = partners.map((p) => ({ id: p.id, fullName: p.fullName }));

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-display-lg text-on-background font-bold">Daily Expenses</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Operational costs recorded day by day.
          </p>
        </div>
        <DailyExpenseDrawer expenseItems={expenseItemOptions} partners={partnerOptions} />
      </div>

      <DailyExpenseFilters
        currentParams={rawParams}
        from={from}
        to={to}
        search={filters.search ?? ""}
        fundingSource={filters.fundingSource ?? ""}
      />

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
        {items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={
                filtersActive
                  ? "No daily expenses match these filters"
                  : "No daily expenses recorded for this range"
              }
              description={
                filtersActive
                  ? "Try widening the date range or clearing a filter."
                  : "Use Add Expense to record the first one."
              }
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
                    <Th className="text-right">Amount</Th>
                    <Th>Funding Source</Th>
                    <Th className="text-right">Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {items.map((item) => {
                    const label = item.expenseItem?.name ?? item.customDescription ?? "Expense";
                    return (
                      <Tr key={item.id}>
                        <Td className="whitespace-nowrap">
                          {item.expenseDate.toISOString().slice(0, 10)}
                        </Td>
                        <Td className="font-medium">
                          {label}
                          {item.expenseItem && !item.expenseItem.isActive ? (
                            <span className="text-on-surface-variant ml-1 text-xs">(archived)</span>
                          ) : null}
                        </Td>
                        <Td className="tabular-nums text-right">{formatMoney(item.amount)}</Td>
                        <Td>
                          {item.fundingSource === "BUSINESS"
                            ? "Business"
                            : `Partner: ${item.fundedBy?.fullName ?? "Unknown"}`}
                        </Td>
                        <Td className="text-right">
                          <DailyExpenseRowActions
                            expense={{
                              id: item.id,
                              expenseDate: item.expenseDate.toISOString().slice(0, 10),
                              expenseItemId: item.expenseItemId,
                              customDescription: item.customDescription,
                              amount: item.amount.toString(),
                              fundingSource: item.fundingSource,
                              fundedByUserId: item.fundedByUserId,
                              updatedAt: item.updatedAt.toISOString(),
                              displayLabel: `${label} — ${item.expenseDate.toISOString().slice(0, 10)} — ${formatMoney(item.amount)}`,
                            }}
                            expenseItems={expenseItemOptions}
                            partners={partnerOptions}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </div>
            <div className="divide-outline-variant/50 divide-y md:hidden">
              {items.map((item) => {
                const label = item.expenseItem?.name ?? item.customDescription ?? "Expense";
                return (
                  <div key={item.id} className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-on-surface font-medium break-words">{label}</h3>
                        <p className="text-on-surface-variant mt-0.5 text-sm">
                          {item.expenseDate.toISOString().slice(0, 10)}
                        </p>
                      </div>
                      <span className="tabular-nums text-on-surface shrink-0 font-semibold">
                        {formatMoney(item.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-on-surface-variant text-sm">
                        {item.fundingSource === "BUSINESS"
                          ? "Business"
                          : `Partner: ${item.fundedBy?.fullName ?? "Unknown"}`}
                      </span>
                      <DailyExpenseRowActions
                        expense={{
                          id: item.id,
                          expenseDate: item.expenseDate.toISOString().slice(0, 10),
                          expenseItemId: item.expenseItemId,
                          customDescription: item.customDescription,
                          amount: item.amount.toString(),
                          fundingSource: item.fundingSource,
                          fundedByUserId: item.fundedByUserId,
                          updatedAt: item.updatedAt.toISOString(),
                          displayLabel: `${label} — ${item.expenseDate.toISOString().slice(0, 10)} — ${formatMoney(item.amount)}`,
                        }}
                        expenseItems={expenseItemOptions}
                        partners={partnerOptions}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
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
    </div>
  );
}
