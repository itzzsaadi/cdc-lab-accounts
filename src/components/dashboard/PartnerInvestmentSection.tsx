import { formatMoney } from "../../lib/domain/money-format";
import { Decimal, ZERO } from "../../lib/domain/money";
import type { PartnerInvestmentSummary } from "../../server/queries/capital-contributions";
import { InfoTip } from "../ui/InfoTip";

interface Props {
  summaries: PartnerInvestmentSummary[];
}

/**
 * FR-INV-01/02 — dashboard summary of each partner's total investment.
 * Shows per-partner totals as KPI tiles plus a proportional comparison bar.
 *
 * This is a Server Component — no "use client" needed; the comparison bar
 * is a plain CSS flex div, not a canvas/SVG chart.
 */
export function PartnerInvestmentSection({ summaries }: Props) {
  if (summaries.length === 0) return null;

  const grandTotal = summaries.reduce(
    (sum, s) => sum.plus(new Decimal(s.total)),
    ZERO,
  );

  const isGrandZero = grandTotal.isZero();

  return (
    <div>
      {/* Per-partner KPI tiles */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => {
          const amount = new Decimal(s.total);
          const pct = isGrandZero
            ? 0
            : amount.dividedBy(grandTotal).times(100).toNumber();

          return (
            <div
              key={s.partnerId}
              className="bg-surface-container-lowest border-outline-variant rounded-lg border p-4 shadow-[0px_1px_2px_rgba(18,48,71,0.08)]"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]" aria-hidden>
                  account_balance_wallet
                </span>
                <p className="text-on-surface-variant text-xs font-medium uppercase tracking-wide truncate">
                  {s.fullName}
                </p>
              </div>
              <p className="tabular-nums text-on-surface mt-1 text-2xl font-bold">
                {formatMoney(s.total)}
              </p>
              <p className="text-on-surface-variant flex items-center mt-1 text-xs">
                <span>{!isGrandZero ? `${pct.toFixed(1)}% of total investment` : "Total investment"}</span>
                <InfoTip>Cumulative total of capital injections, partner-funded expenses, and cash asset purchases, minus drawings. Does not dictate profit-sharing ratio.</InfoTip>
              </p>
            </div>
          );
        })}
      </div>

      {/* Proportional comparison bar — only meaningful with 2+ partners and non-zero totals */}
      {summaries.length >= 2 && !isGrandZero && (
        <div>
          <p className="text-on-surface-variant mb-1 text-xs font-medium">Investment split</p>
          <div
            className="border-outline-variant flex h-3 w-full overflow-hidden rounded-full border"
            role="img"
            aria-label={summaries
              .map(
                (s) =>
                  `${s.fullName}: ${new Decimal(s.total).dividedBy(grandTotal).times(100).toFixed(1)}%`,
              )
              .join(", ")}
          >
            {summaries.map((s, i) => {
              const pct = new Decimal(s.total)
                .dividedBy(grandTotal)
                .times(100)
                .toNumber();
              const colors = [
                "bg-primary",
                "bg-secondary",
                "bg-tertiary",
                "bg-error",
              ];
              return (
                <div
                  key={s.partnerId}
                  className={`${colors[i % colors.length]} h-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {summaries.map((s, i) => {
              const dotColors = [
                "bg-primary",
                "bg-secondary",
                "bg-tertiary",
                "bg-error",
              ];
              return (
                <span key={s.partnerId} className="text-on-surface-variant inline-flex items-center gap-1 text-xs">
                  <span className={`inline-block h-2 w-2 rounded-full ${dotColors[i % dotColors.length]}`} />
                  {s.fullName}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
