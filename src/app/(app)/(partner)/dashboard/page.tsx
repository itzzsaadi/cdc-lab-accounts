import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { getDashboardTrend } from "../../../../server/queries/results";
import { getDashboardWarnings } from "../../../../server/queries/warnings";
import { getPartnerInvestmentSummaries } from "../../../../server/queries/capital-contributions";
import {
  currentYearMonthInKarachi,
  previousYearMonth,
  monthBounds,
} from "../../../../lib/domain/calendar-date";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Card } from "../../../../components/ui/Card";
import { Alert } from "../../../../components/ui/Alert";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ProvisionalNotice } from "../../../../components/offline/ProvisionalNotice";
import { PendingUploadTile } from "../../../../components/dashboard/PendingUploadTile";
import { ProvisionalTotalsWrapper } from "../../../../components/offline/ProvisionalTotalsWrapper";
import { KpiCard } from "../../../../components/dashboard/KpiCard";
import { ProfitSplitCards } from "../../../../components/dashboard/ProfitSplitCards";
import { IncomeExpenseBarChart } from "../../../../components/dashboard/IncomeExpenseBarChart";
import { IncomeBreakdownDonut } from "../../../../components/dashboard/IncomeBreakdownDonut";
import { ExpenseBreakdownDonut } from "../../../../components/dashboard/ExpenseBreakdownDonut";
import { PartnerInvestmentSection } from "../../../../components/dashboard/PartnerInvestmentSection";
import { InfoTip } from "../../../../components/ui/InfoTip";

/**
 * FR-DASH-01 to 05 / FR-WARN-01/02/04 — Partner Dashboard.
 *
 * Layout (top → bottom):
 *   1. Header + offline notices
 *   2. KPI cards (income / expenses / net) with delta % vs prior month
 *   3. Profit-split cards (Partner A / B shares) — only when configured
 *   4. 6-month grouped bar chart (Income vs Expenses vs Net Result)
 *   5. Current-month breakdown donuts (income split + expense split)
 *   6. Partner investment summary + comparison bar
 *   7. Warnings panel
 *
 * Every figure is a real aggregate from /lib/domain-backed queries —
 * nothing here is a stored/cached total (CLAUDE.md §12).
 */
export default async function PartnerDashboardPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "report:dashboard");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const currentMonth = currentYearMonthInKarachi();

  const [trend, warnings, investmentSummaries] = await Promise.all([
    getDashboardTrend(prisma, user, currentMonth, 6),
    getDashboardWarnings(prisma, user, currentMonth),
    getPartnerInvestmentSummaries(prisma, user),
  ]);

  const current = trend[trend.length - 1];
  const previous = trend[trend.length - 2] ?? null;
  const previousMonthLabel = previousYearMonth(currentMonth);

  const warningCount =
    warnings.missingRecurring.length +
    warnings.missingInstalments.length +
    warnings.variance.length;
  const hasWarnings = warningCount > 0;

  const currentMonthBounds = monthBounds(currentMonth);

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <h1 className="text-display-lg text-on-background mb-1 font-bold">Partner Dashboard</h1>
      <p className="text-on-surface-variant mb-6 text-sm">
        {currentMonth} · Figures computed live from entries — nothing here is a stored total.
      </p>

      {/* ── Offline notices ────────────────────────────────────────── */}
      <div className="mb-4">
        <ProvisionalNotice from={currentMonthBounds.firstDay} to={currentMonthBounds.lastDay} />
      </div>
      {/* FR-RPT-02: renders nothing when queue is empty */}
      <PendingUploadTile />

      {/* ── Row 1: KPI cards ───────────────────────────────────────── */}
      <ProvisionalTotalsWrapper from={currentMonthBounds.firstDay} to={currentMonthBounds.lastDay}>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Total Income — This Month"
            current={current.totalIncome}
            previous={previous?.totalIncome ?? null}
            previousMonthLabel={previous ? previousMonthLabel : null}
            tooltip="Sum of all Counter Income (walk-in fees) and Party Income (referral fees) recorded this month."
          />
          <KpiCard
            label="Total Expenses — This Month"
            current={current.totalExpenses}
            previous={previous?.totalExpenses ?? null}
            previousMonthLabel={previous ? previousMonthLabel : null}
            tooltip="Sum of all business-funded daily and monthly expenses. Partner-funded expenses are excluded."
          />
          <KpiCard
            label="Net Profit / Loss — This Month"
            current={current.netResult}
            previous={previous?.netResult ?? null}
            previousMonthLabel={previous ? previousMonthLabel : null}
            isResultCard
            tooltip="Total Income minus Total Business Expenses. A negative value indicates a net loss."
          />
        </div>
      </ProvisionalTotalsWrapper>

      {/* ── Row 2: Profit-split partner cards (when configured) ────── */}
      {current.split && (
        <ProfitSplitCards split={current.split} netResult={current.netResult} />
      )}

      {/* ── Row 3: 6-month trend — grouped bar chart ───────────────── */}
      <Card className="mb-6 p-4">
        <h2 className="text-on-surface mb-1 text-lg font-semibold">
          Income vs Expenses — Last 6 Months
        </h2>
        <p className="text-on-surface-variant mb-4 text-xs">
          Income, business expenses, and net result per month.
        </p>
        <IncomeExpenseBarChart points={trend} />
      </Card>

      {/* ── Row 4: Current-month breakdown donuts ──────────────────── */}
      {current.totalCounterIncome !== null &&
        current.totalPartyIncome !== null &&
        current.dailyExpenseBusinessTotal !== null &&
        current.monthlyExpenseBusinessTotal !== null && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <h2 className="text-on-surface mb-1 text-lg font-semibold">Income Sources</h2>
              <p className="text-on-surface-variant mb-2 text-xs">
                Counter income vs party income this month.
              </p>
              <IncomeBreakdownDonut
                totalCounterIncome={current.totalCounterIncome}
                totalPartyIncome={current.totalPartyIncome}
              />
            </Card>
            <Card className="p-4">
              <h2 className="text-on-surface mb-1 text-lg font-semibold">Expense Composition</h2>
              <p className="text-on-surface-variant mb-2 text-xs">
                Daily vs monthly (admin/purchasing) business expenses.
              </p>
              <ExpenseBreakdownDonut
                dailyExpenseBusinessTotal={current.dailyExpenseBusinessTotal}
                monthlyExpenseBusinessTotal={current.monthlyExpenseBusinessTotal}
              />
            </Card>
          </div>
        )}

      {/* ── Row 5: Partner investment summary ──────────────────────── */}
      {investmentSummaries.length > 0 && (
        <Card className="mb-6 p-4">
          <h2 className="text-on-surface mb-1 text-lg font-semibold">Partner Investment</h2>
          <p className="text-on-surface-variant mb-4 text-xs">
            Total investment per partner — contributions, funded expenses, and cash assets.
          </p>
          <PartnerInvestmentSection summaries={investmentSummaries} />
        </Card>
      )}

      {/* ── Row 6: Warnings ────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-on-surface text-lg font-semibold">Warnings <InfoTip>Alerts for missing recurring expenses, missing instalment entries, or unusual expense variances compared to last month.</InfoTip></h2>
          {hasWarnings && (
            <span className="bg-error text-on-error inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold">
              {warningCount}
            </span>
          )}
        </div>
        {!hasWarnings ? (
          <EmptyState title="No warnings" description="Nothing needs attention this month." />
        ) : (
          <div className="flex flex-col gap-3">
            {warnings.missingRecurring.map((item) => (
              <Alert key={`recurring-${item.categoryId}`} variant="warning">
                Recurring category <strong>{item.categoryName}</strong> has no entry yet this month.
              </Alert>
            ))}
            {warnings.missingInstalments.map((item) => (
              <Alert key={`instalment-${item.assetId}`} variant="warning">
                Instalment asset <strong>{item.assetName}</strong> has no instalment entry yet this
                month.
              </Alert>
            ))}
            {warnings.variance.map((item) => (
              <Alert key={`variance-${item.categoryId}`} variant="warning">
                <strong>{item.categoryName}</strong> changed from{" "}
                {formatMoney(item.previousAmount)} to {formatMoney(item.currentAmount)} — more than
                the {formatMoney(item.thresholdAmount)} expected variance.
              </Alert>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
