import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import {
  listMonthlyExpenses,
  listActiveExpenseCategories,
  listActiveVendors,
} from "../../../../server/queries/monthly-expenses";
import { currentYearMonthInKarachi } from "../../../../lib/domain/calendar-date";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { MonthlyExpenseDrawer } from "../../../../components/entries/MonthlyExpenseDrawer";
import { MonthlyExpenseRowActions } from "../../../../components/entries/MonthlyExpenseRowActions";
import { InstalmentGenerationPanel } from "../../../../components/entries/InstalmentGenerationPanel";
import { RecurringPrefillPanel } from "../../../../components/entries/RecurringPrefillPanel";

/** FR-MEXP-01 to 08, FR-AST-04. Month selector defaults to the current calendar month (BR-13); a `month` query param may target any other month, including a past one (nothing auto-backfills a missed month). */
export default async function MonthlyExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "monthly-expense:manage");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const rawMonth = (await searchParams).month;
  const periodMonth =
    rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentYearMonthInKarachi();

  const [{ administration, purchasing, combinedBusinessTotal }, categories, vendors, partners] =
    await Promise.all([
      listMonthlyExpenses(prisma, user, periodMonth),
      listActiveExpenseCategories(prisma),
      listActiveVendors(prisma),
      prisma.user.findMany({
        where: { isPartner: true, isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
    ]);

  const categoryOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
    expenseGroup: c.expenseGroup,
  }));
  const vendorOptions = vendors.map((v) => ({ id: v.id, name: v.name }));
  const partnerOptions = partners.map((p) => ({ id: p.id, fullName: p.fullName }));

  function renderSection(
    title: string,
    items: typeof administration.items,
    subtotalLabel: string,
    subtotal: string,
  ) {
    return (
      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
        <h2 className="text-on-surface border-outline-variant border-b p-4 text-lg font-semibold">
          {title}
        </h2>
        {items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={`No ${title.toLowerCase()} entries`}
              description="Use Add Expense to record the first one."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Category</Th>
                  <Th>Vendor</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Funding Source</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((item) => {
                  const label = `${item.category.name} — ${formatMoney(item.amount)}`;
                  return (
                    <Tr key={item.id}>
                      <Td className="font-medium">
                        {item.category.name}
                        {!item.category.isActive ? (
                          <span className="text-on-surface-variant ml-1 text-xs">(archived)</span>
                        ) : null}
                        {item.asset ? (
                          <span className="text-tertiary ml-1 text-xs">
                            (instalment: {item.asset.name})
                          </span>
                        ) : null}
                        {item.description ? (
                          <p className="text-on-surface-variant text-xs">{item.description}</p>
                        ) : null}
                      </Td>
                      <Td>{item.vendor?.name ?? "—"}</Td>
                      <Td className="tabular-nums text-right">{formatMoney(item.amount)}</Td>
                      <Td>
                        {item.fundingSource === "BUSINESS"
                          ? "Business"
                          : `Partner: ${item.fundedBy?.fullName ?? "Unknown"}`}
                      </Td>
                      <Td className="text-right">
                        <MonthlyExpenseRowActions
                          expense={{
                            id: item.id,
                            periodMonth,
                            categoryId: item.categoryId,
                            vendorId: item.vendorId,
                            description: item.description,
                            amount: item.amount.toString(),
                            fundingSource: item.fundingSource,
                            fundedByUserId: item.fundedByUserId,
                            updatedAt: item.updatedAt.toISOString(),
                            displayLabel: label,
                            isSystemGenerated: Boolean(item.assetId),
                          }}
                          categories={categoryOptions}
                          vendors={vendorOptions}
                          partners={partnerOptions}
                        />
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </div>
        )}
        <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-end border-t p-4">
          <span className="tabular-nums text-on-surface font-semibold">
            {subtotalLabel}: {formatMoney(subtotal)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-display-lg text-on-background font-bold">Monthly Expenses</h1>
          <p className="text-on-surface-variant mt-1 text-sm">{periodMonth}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RecurringPrefillPanel periodMonth={periodMonth} />
          <InstalmentGenerationPanel periodMonth={periodMonth} />
          <MonthlyExpenseDrawer
            periodMonth={periodMonth}
            categories={categoryOptions}
            vendors={vendorOptions}
            partners={partnerOptions}
          />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {renderSection(
          "Administration",
          administration.items,
          "Administration Subtotal",
          administration.subtotal,
        )}
        <div className="border-outline-variant bg-surface-container-lowest rounded-xl border p-4 text-sm shadow-sm">
          <span className="text-on-surface-variant">
            Daily Expenses (read-only, system-generated):{" "}
          </span>
          <span className="tabular-nums text-on-surface font-medium">
            {formatMoney(purchasing.dailyExpenseTotal)}
          </span>
        </div>
        {renderSection(
          "Purchasing",
          purchasing.items,
          "Purchasing Subtotal (incl. Daily Expenses)",
          purchasing.subtotal,
        )}
        <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-end rounded-xl border p-4 shadow-sm">
          <span className="tabular-nums text-on-surface text-lg font-semibold">
            Business-Funded Total (affects profit): {formatMoney(combinedBusinessTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
