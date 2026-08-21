import { Decimal, ZERO } from "../../lib/domain/money";
import { formatMoney } from "../../lib/domain/money-format";
import type { MonthlyTrendPoint } from "../../server/queries/results";

const CHART_HEIGHT = 160;
const BAR_WIDTH = 32;
const BAR_GAP = 16;
const BASELINE_Y = CHART_HEIGHT / 2;

/** `YYYY-MM` -> a short label ("Aug 2026") for the chart's x-axis, without pulling in a date-formatting library. */
function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${names[Number(month) - 1]} ${year}`;
}

/**
 * FR-DASH's approved plain SVG/CSS trend chart — no charting library
 * (CLAUDE.md §24 dependency policy). Net-result-per-month bars, scaled
 * against the largest magnitude in the series; the bar's pixel height is a
 * display coordinate only (`Decimal` still drives every comparison and the
 * scale factor itself — only the final SVG coordinate is a plain number,
 * the same "convert only at the rendering/export boundary" discipline
 * `decimal-export.ts` uses for spreadsheet cells). Accessible via a
 * `<title>`/`<desc>` pair on the SVG plus a visually-hidden data table
 * carrying the same figures in text form, so the chart's information is
 * never SVG-only.
 */
export function TrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-on-surface-variant text-sm">No data available yet.</p>;
  }

  const maxAbs = points.reduce((max, point) => {
    const abs = new Decimal(point.netResult).abs();
    return abs.greaterThan(max) ? abs : max;
  }, ZERO);

  const chartWidth = points.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;
  const summary = points
    .map((point) => `${monthLabel(point.month)}: ${formatMoney(point.netResult)}`)
    .join("; ");

  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-labelledby="trend-chart-title trend-chart-desc"
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT + 24}`}
        width="100%"
        height={CHART_HEIGHT + 24}
        className="max-w-full"
      >
        <title id="trend-chart-title">{`Net profit or loss trend, last ${points.length} months`}</title>
        <desc id="trend-chart-desc">{summary}</desc>
        <line
          x1={0}
          y1={BASELINE_Y}
          x2={chartWidth}
          y2={BASELINE_Y}
          className="stroke-outline-variant"
          strokeWidth={1}
        />
        {points.map((point, index) => {
          const value = new Decimal(point.netResult);
          const isLoss = value.isNegative();
          const magnitudeRatio = maxAbs.isZero() ? 0 : value.abs().dividedBy(maxAbs).toNumber();
          const barHeight = magnitudeRatio * (BASELINE_Y - 8);
          const x = BAR_GAP + index * (BAR_WIDTH + BAR_GAP);
          const y = isLoss ? BASELINE_Y : BASELINE_Y - barHeight;

          return (
            <g key={point.month}>
              <rect
                x={x}
                y={y}
                width={BAR_WIDTH}
                height={Math.max(barHeight, 1)}
                className={isLoss ? "fill-error" : "fill-primary"}
              >
                <title>{`${monthLabel(point.month)}: ${formatMoney(point.netResult)}`}</title>
              </rect>
              <text
                x={x + BAR_WIDTH / 2}
                y={CHART_HEIGHT + 16}
                textAnchor="middle"
                className="fill-on-surface-variant text-[10px]"
              >
                {monthLabel(point.month).replace(" ", " ")}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Net profit or loss by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Total Income</th>
            <th scope="col">Total Expenses</th>
            <th scope="col">Net Result</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <th scope="row">{monthLabel(point.month)}</th>
              <td>{formatMoney(point.totalIncome)}</td>
              <td>{formatMoney(point.totalExpenses)}</td>
              <td>{formatMoney(point.netResult)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
