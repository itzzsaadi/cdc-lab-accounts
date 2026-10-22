import { formatMoney } from "../../lib/domain/money-format";
import { Decimal, ZERO } from "../../lib/domain/money";
import { InfoTip } from "../ui/InfoTip";

interface Props {
  label: string;
  current: string;
  previous: string | null;
  previousMonthLabel: string | null;
  /** When true the value is styled red for losses (used for Net Result). */
  isResultCard?: boolean;
  tooltip?: string;
}

/**
 * FR-DASH-01 to 03 — single KPI tile with delta % indicator vs the
 * previous month.  The percentage is computed with `Decimal` arithmetic
 * and converted to a display `number` only at the render boundary
 * (CLAUDE.md §10). When the previous amount is zero the delta % is not
 * shown (division by zero is meaningless, not "infinite").
 */
export function KpiCard({
  label,
  current,
  previous,
  previousMonthLabel,
  isResultCard,
  tooltip,
}: Props) {
  const currentDec = new Decimal(current);
  const previousDec = previous ? new Decimal(previous) : null;

  let deltaPercent: number | null = null;
  let deltaDirection: "up" | "down" | "flat" | null = null;

  if (previousDec && !previousDec.isZero()) {
    const diff = currentDec.minus(previousDec);
    const pct = diff.dividedBy(previousDec.abs()).times(100).toNumber();
    deltaPercent = Math.abs(pct);
    if (diff.greaterThan(ZERO)) deltaDirection = "up";
    else if (diff.lessThan(ZERO)) deltaDirection = "down";
    else deltaDirection = "flat";
  }

  const isNegative = currentDec.isNegative();
  const valueColor =
    isResultCard && isNegative ? "text-error" : "text-on-surface";

  // For the delta badge: income/net going up = good (green); expenses going
  // up = bad (red). For simplicity we use neutral colours and let the arrow
  // direction communicate the change without imposing a judgement here —
  // the caller can pass isResultCard to get red on losses.
  const deltaColor =
    deltaDirection === "up"
      ? "text-tertiary"
      : deltaDirection === "down"
        ? "text-error"
        : "text-on-surface-variant";

  const deltaIcon =
    deltaDirection === "up"
      ? "arrow_upward"
      : deltaDirection === "down"
        ? "arrow_downward"
        : "remove";

  return (
    <div className="bg-surface-container-lowest border-outline-variant rounded-lg border p-4 shadow-[0px_1px_2px_rgba(18,48,71,0.08)]">
      <p className="text-on-surface-variant flex items-center text-xs font-medium">
        <span className="uppercase tracking-wide">{label}</span>
        {tooltip && <InfoTip>{tooltip}</InfoTip>}
      </p>
      <p className={`tabular-nums mt-1 text-2xl font-bold ${valueColor}`}>
        {formatMoney(current)}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        {deltaDirection !== null && deltaPercent !== null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${deltaColor}`}>
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              {deltaIcon}
            </span>
            {deltaPercent.toFixed(1)}%
          </span>
        )}
        {previousDec && previousMonthLabel ? (
          <p className="text-on-surface-variant text-xs">
            vs {previousMonthLabel} ({formatMoney(previous!)})
          </p>
        ) : (
          <p className="text-on-surface-variant text-xs">No prior month data</p>
        )}
      </div>
    </div>
  );
}
