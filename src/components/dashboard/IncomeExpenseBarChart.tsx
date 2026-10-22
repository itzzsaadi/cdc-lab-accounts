"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyTrendPoint } from "../../server/queries/results";
import { InfoTip } from "../ui/InfoTip";

/** `YYYY-MM` → short label without pulling in a date library. */
function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(month) - 1]} ${year}`;
}

/** Formats PKR amounts compactly for axis labels (e.g. 1,200,000 → "1.2M"). */
function formatAxisMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

/** Formats PKR amounts for the tooltip. */
function formatTooltipMoney(value: number): string {
  return `Rs ${value.toLocaleString("en-PK")}`;
}

interface Props {
  points: MonthlyTrendPoint[];
  title?: string;
}

/**
 * FR-DASH grouped bar chart — Income vs Expenses vs Net Result for the
 * last N months.  All three series were already fetched by
 * `getDashboardTrend`; this component just renders them.
 *
 * "use client" is required because Recharts uses browser APIs.
 * Monetary values arrive as Decimal strings and are converted to JS
 * `number` only at the SVG/rendering boundary — all actual arithmetic
 * remains in the server query layer (CLAUDE.md §10).
 */
export function IncomeExpenseBarChart({ points, title }: Props) {
  if (points.length === 0) {
    return <p className="text-on-surface-variant text-sm">No data available yet.</p>;
  }

  const data = points.map((p) => ({
    month: monthLabel(p.month),
    Income: parseFloat(p.totalIncome),
    Expenses: parseFloat(p.totalExpenses),
    "Net Result": parseFloat(p.netResult),
  }));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-on-surface-variant text-xs font-medium">
          {title ?? "Income vs Expenses"}
        </span>
        <InfoTip>Income includes Counter and Party receipts. Expenses include business-funded daily and monthly costs. Net Result is Income minus Expenses.</InfoTip>
      </div>
      <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant, #cad4dc)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "var(--color-on-surface-variant, #3f5464)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatAxisMoney}
          tick={{ fontSize: 11, fill: "var(--color-on-surface-variant, #3f5464)" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          formatter={(value, name) => [formatTooltipMoney(Number(value ?? 0)), String(name)]}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid var(--color-outline-variant, #cad4dc)",
            background: "var(--color-surface-container-lowest, #fff)",
            fontSize: 12,
          }}
          cursor={{ fill: "var(--color-surface-container, #f0f4f8)", opacity: 0.6 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="square"
          iconSize={10}
        />
        <Bar dataKey="Income" fill="var(--color-primary, #0072b1)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Expenses" fill="var(--color-error, #ba1a1a)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Net Result" fill="var(--color-tertiary, #006c51)" radius={[3, 3, 0, 0]} />
      </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
