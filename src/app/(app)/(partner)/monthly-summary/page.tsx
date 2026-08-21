import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import {
  getMonthlyResultTotals,
  getItemizedExpenseBreakdown,
} from "../../../../server/queries/results";
import { listActivePartnersForMapping } from "../../../../server/queries/app-settings";
import {
  currentYearMonthInKarachi,
  monthBounds,
  previousYearMonth,
  nextYearMonth,
  parseCustomDateRange,
} from "../../../../lib/domain/calendar-date";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Decimal } from "../../../../lib/domain/money";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { PartnerMappingSetupPanel } from "../../../../components/entries/PartnerMappingSetupPanel";

/** FR-RES-01 to 11, FR-RPT-06 to 08. Month-stepping is the default view; `?from=&to=` switches to an arbitrary custom range (FR-RES-01/AC-09) — both validated server-side, never trusted from the URL directly. */
export default async function MonthlySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
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
  let currentMonth: string;
  let isCustomRange = false;

  if (params.from && params.to) {
    const parsed = parseCustomDateRange(params.from, params.to);
    if (parsed) {
      range = parsed;
      currentMonth = parsed.from.slice(0, 7);
      isCustomRange = true;
    } else {
      const month = currentYearMonthInKarachi();
      const bounds = monthBounds(month);
      range = { from: bounds.firstDay, to: bounds.lastDay };
      currentMonth = month;
    }
  } else {
    const month =
      params.month && /^\d{4}-\d{2}$/.test(params.month)
        ? params.month
        : currentYearMonthInKarachi();
    const bounds = monthBounds(month);
    range = { from: bounds.firstDay, to: bounds.lastDay };
    currentMonth = month;
  }

  const [totals, breakdown, partners] = await Promise.all([
    getMonthlyResultTotals(prisma, user, range),
    getItemizedExpenseBreakdown(prisma, user, range),
    listActivePartnersForMapping(prisma),
  ]);

  const isAdmin = user!.role === "ADMIN";

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-display-lg text-on-background font-bold">Monthly Summary</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            {range.from} to {range.to}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isCustomRange ? (
            <>
              <a
                href={`/monthly-summary?month=${previousYearMonth(currentMonth)}`}
                className="border-outline-variant text-on-surface hover:bg-surface-container flex h-11 items-center rounded-lg border px-4 text-sm font-medium"
              >
                ← Previous Month
              </a>
              <a
                href={`/monthly-summary?month=${nextYearMonth(currentMonth)}`}
                className="border-outline-variant text-on-surface hover:bg-surface-container flex h-11 items-center rounded-lg border px-4 text-sm font-medium"
              >
                Next Month →
              </a>
            </>
          ) : null}
          <a
            href={`/api/reports/monthly-summary/pdf?from=${range.from}&to=${range.to}`}
            className="bg-primary text-on-primary hover:bg-primary-container flex h-11 items-center rounded-lg px-4 text-sm font-medium"
          >
            Export PDF
          </a>
          <a
            href={`/api/reports/monthly-summary/excel?from=${range.from}&to=${range.to}`}
            className="bg-primary text-on-primary hover:bg-primary-container flex h-11 items-center rounded-lg px-4 text-sm font-medium"
          >
            Export Excel
          </a>
        </div>
      </div>

      <form
        action="/monthly-summary"
        className="border-outline-variant bg-surface-container-lowest mb-6 flex flex-wrap items-end gap-4 rounded-xl border p-4 shadow-sm"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="range-from"
            className="text-on-surface-variant text-xs font-medium uppercase"
          >
            From
          </label>
          <input
            id="range-from"
            name="from"
            type="date"
            defaultValue={range.from}
            className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="range-to"
            className="text-on-surface-variant text-xs font-medium uppercase"
          >
            To
          </label>
          <input
            id="range-to"
            name="to"
            type="date"
            defaultValue={range.to}
            className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-on-primary hover:bg-primary-container h-11 rounded-lg px-4 text-sm font-medium"
        >
          Apply Custom Range
        </button>
      </form>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-on-surface-variant text-xs font-medium uppercase">Total Income</p>
          <p className="tabular-nums text-on-surface mt-1 text-2xl font-bold">
            {formatMoney(totals.totalIncome)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-on-surface-variant text-xs font-medium uppercase">
            Total Expenses (Business)
          </p>
          <p className="tabular-nums text-on-surface mt-1 text-2xl font-bold">
            {formatMoney(totals.totalExpenses)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-on-surface-variant text-xs font-medium uppercase">Net Profit / Loss</p>
          <p className="tabular-nums text-on-surface mt-1 text-2xl font-bold">
            {formatMoney(totals.netResult)}
          </p>
        </Card>
      </div>

      <div className="border-outline-variant bg-surface-container-lowest mb-6 overflow-hidden rounded-xl border p-4 shadow-sm">
        <h2 className="text-on-surface mb-3 text-lg font-semibold">Income</h2>
        <p className="text-sm">
          Counter Income:{" "}
          <span className="tabular-nums font-medium">{formatMoney(totals.totalCounterIncome)}</span>
        </p>
        <p className="text-sm">
          Party Income (daily, monthly, direct cash):{" "}
          <span className="tabular-nums font-medium">{formatMoney(totals.totalPartyIncome)}</span>
        </p>
      </div>

      <div className="border-outline-variant bg-surface-container-lowest mb-6 overflow-hidden rounded-xl border p-4 shadow-sm">
        <h2 className="text-on-surface mb-3 text-lg font-semibold">Administration Expenses</h2>
        {breakdown.administration.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No entries in this range.</p>
        ) : (
          breakdown.administration.map((item) => (
            <p
              key={`${item.categoryId}-${item.fundingSource}`}
              className="flex justify-between text-sm"
            >
              <span>
                {item.categoryName}
                {!item.categoryActive ? (
                  <span className="text-on-surface-variant ml-1 text-xs">(archived)</span>
                ) : null}
                {item.fundingSource === "PARTNER" ? (
                  <span className="text-on-surface-variant ml-1 text-xs">
                    (Partner-funded — excluded from profit)
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums">{formatMoney(item.amount)}</span>
            </p>
          ))
        )}
      </div>

      <div className="border-outline-variant bg-surface-container-lowest mb-6 overflow-hidden rounded-xl border p-4 shadow-sm">
        <h2 className="text-on-surface mb-3 text-lg font-semibold">Purchasing Expenses</h2>
        <p className="flex justify-between text-sm">
          <span>Daily Expenses (system-generated line)</span>
          <span className="tabular-nums">{formatMoney(totals.dailyExpenseBusinessTotal)}</span>
        </p>
        {new Decimal(totals.dailyExpenseTotal).greaterThan(
          new Decimal(totals.dailyExpenseBusinessTotal),
        ) ? (
          <p className="flex justify-between text-sm">
            <span>
              Daily Expenses
              <span className="text-on-surface-variant ml-1 text-xs">
                (Partner-funded — excluded from profit)
              </span>
            </span>
            <span className="tabular-nums">
              {formatMoney(
                new Decimal(totals.dailyExpenseTotal).minus(totals.dailyExpenseBusinessTotal),
              )}
            </span>
          </p>
        ) : null}
        {breakdown.purchasing.map((item) => (
          <p
            key={`${item.categoryId}-${item.fundingSource}`}
            className="flex justify-between text-sm"
          >
            <span>
              {item.categoryName}
              {!item.categoryActive ? (
                <span className="text-on-surface-variant ml-1 text-xs">(archived)</span>
              ) : null}
              {item.fundingSource === "PARTNER" ? (
                <span className="text-on-surface-variant ml-1 text-xs">
                  (Partner-funded — excluded from profit)
                </span>
              ) : null}
            </span>
            <span className="tabular-nums">{formatMoney(item.amount)}</span>
          </p>
        ))}
      </div>

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border p-4 shadow-sm">
        <h2 className="text-on-surface mb-3 text-lg font-semibold">Partner Split</h2>
        {totals.split.isConfigured ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <p className="text-sm">
              {totals.split.partnerAName} ({totals.split.splitAPercent}%):{" "}
              <span className="tabular-nums font-semibold">
                {formatMoney(totals.split.shareA!)}
              </span>
            </p>
            <p className="text-sm">
              {totals.split.partnerBName} ({totals.split.splitBPercent}%):{" "}
              <span className="tabular-nums font-semibold">
                {formatMoney(totals.split.shareB!)}
              </span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <EmptyState
              title="Profit split configuration required"
              description="No split is shown until both Partner A and Partner B are configured."
            />
            {isAdmin ? (
              <PartnerMappingSetupPanel
                partners={partners.map((p) => ({ id: p.id, fullName: p.fullName }))}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
