import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { getDashboardTrend } from "../../../../server/queries/results";
import { getDashboardWarnings } from "../../../../server/queries/warnings";
import {
  currentYearMonthInKarachi,
  previousYearMonth,
  monthBounds,
} from "../../../../lib/domain/calendar-date";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Card } from "../../../../components/ui/Card";
import { Alert } from "../../../../components/ui/Alert";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { TrendChart } from "../../../../components/dashboard/TrendChart";
import { ProvisionalNotice } from "../../../../components/offline/ProvisionalNotice";
import { ProvisionalTotalsWrapper } from "../../../../components/offline/ProvisionalTotalsWrapper";

/** FR-DASH-01 to 05 / FR-WARN-01/02/04 — current-vs-previous-month tiles, a plain SVG trend chart, and a warnings panel. Every figure is a real aggregate from `/lib/domain`-backed queries, never a placeholder value (CLAUDE.md §12 — nothing here is a stored/cached total). */
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

  const [trend, warnings] = await Promise.all([
    getDashboardTrend(prisma, user, currentMonth, 6),
    getDashboardWarnings(prisma, user, currentMonth),
  ]);

  const current = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  const previousMonthLabel = previousYearMonth(currentMonth);

  const hasWarnings =
    warnings.missingRecurring.length > 0 ||
    warnings.missingInstalments.length > 0 ||
    warnings.variance.length > 0;

  const currentMonthBounds = monthBounds(currentMonth);

  return (
    <div>
      <h1 className="text-display-lg text-on-background mb-1 font-bold">Partner Dashboard</h1>
      <p className="text-on-surface-variant mb-6 text-sm">
        Signed in as {user!.role}. Figures below are computed live from the current entries —
        nothing shown here is a stored total.
      </p>

      <div className="mb-6">
        <ProvisionalNotice from={currentMonthBounds.firstDay} to={currentMonthBounds.lastDay} />
      </div>

      <ProvisionalTotalsWrapper from={currentMonthBounds.firstDay} to={currentMonthBounds.lastDay}>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-on-surface-variant text-xs font-medium uppercase">
              Total Income — This Month
            </p>
            <p className="tabular-nums text-on-surface mt-1 text-2xl font-bold">
              {formatMoney(current.totalIncome)}
            </p>
            {previous ? (
              <p className="text-on-surface-variant mt-1 text-xs">
                Previous month ({previousMonthLabel}): {formatMoney(previous.totalIncome)}
              </p>
            ) : null}
          </Card>
          <Card className="p-4">
            <p className="text-on-surface-variant text-xs font-medium uppercase">
              Total Expenses — This Month
            </p>
            <p className="tabular-nums text-on-surface mt-1 text-2xl font-bold">
              {formatMoney(current.totalExpenses)}
            </p>
            {previous ? (
              <p className="text-on-surface-variant mt-1 text-xs">
                Previous month ({previousMonthLabel}): {formatMoney(previous.totalExpenses)}
              </p>
            ) : null}
          </Card>
          <Card className="p-4">
            <p className="text-on-surface-variant text-xs font-medium uppercase">
              Net Profit / Loss — This Month
            </p>
            <p className="tabular-nums text-on-surface mt-1 text-2xl font-bold">
              {formatMoney(current.netResult)}
            </p>
            {previous ? (
              <p className="text-on-surface-variant mt-1 text-xs">
                Previous month ({previousMonthLabel}): {formatMoney(previous.netResult)}
              </p>
            ) : null}
          </Card>
        </div>
      </ProvisionalTotalsWrapper>

      <Card className="mb-6 p-4">
        <h2 className="text-on-surface mb-3 text-lg font-semibold">Trend — Last 6 Months</h2>
        <TrendChart points={trend} />
      </Card>

      <Card className="p-4">
        <h2 className="text-on-surface mb-3 text-lg font-semibold">Warnings</h2>
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
                <strong>{item.categoryName}</strong> changed from {formatMoney(item.previousAmount)}{" "}
                to {formatMoney(item.currentAmount)} — more than the{" "}
                {formatMoney(item.thresholdAmount)} expected variance.
              </Alert>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
