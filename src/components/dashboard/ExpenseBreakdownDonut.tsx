"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { InfoTip } from "../ui/InfoTip";

function formatTooltipMoney(value: number): string {
  return `Rs ${value.toLocaleString("en-PK")}`;
}

interface Props {
  dailyExpenseBusinessTotal: string;
  monthlyExpenseBusinessTotal: string;
  title?: string;
}

/**
 * Donut chart: Daily Expenses vs Monthly (Admin/Purchasing) Expenses for
 * the current month.  Helps partners understand whether cost overruns are
 * in variable daily spending or fixed monthly categories.
 *
 * Only BUSINESS-funded totals are shown here — partner-funded amounts
 * are excluded from the expense total per BR-05 (CLAUDE.md §7).
 *
 * Values arrive as Decimal strings; converted to number only at the
 * rendering boundary (CLAUDE.md §10).
 */
export function ExpenseBreakdownDonut({
  dailyExpenseBusinessTotal,
  monthlyExpenseBusinessTotal,
  title,
}: Props) {
  const daily = parseFloat(dailyExpenseBusinessTotal);
  const monthly = parseFloat(monthlyExpenseBusinessTotal);
  const total = daily + monthly;

  if (total === 0) {
    return (
      <p className="text-on-surface-variant flex h-full items-center justify-center py-8 text-sm">
        No expenses recorded this month.
      </p>
    );
  }

  const data = [
    { name: "Daily Expenses", value: daily },
    { name: "Monthly Expenses", value: monthly },
  ];

  const COLORS = [
    "var(--color-error, #ba1a1a)",
    "var(--color-error-container, #ffdad6)",
  ];

  const pct = (val: number) => total > 0 ? `${((val / total) * 100).toFixed(1)}%` : "—";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="text-on-surface-variant text-xs font-medium">
          {title ?? "Expense Breakdown"}
        </span>
        <InfoTip>Daily Expenses are variable day-to-day operational costs. Monthly Expenses are fixed overhead including Administration and Purchasing.</InfoTip>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [formatTooltipMoney(Number(value ?? 0))]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid var(--color-outline-variant, #cad4dc)",
              background: "var(--color-surface-container-lowest, #fff)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
      {/* Breakdown text below the chart */}
      <div className="flex justify-around text-center text-xs">
        <div>
          <p className="text-on-surface-variant">Daily</p>
          <p className="text-on-surface font-semibold tabular-nums">{pct(daily)}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">Monthly</p>
          <p className="text-on-surface font-semibold tabular-nums">{pct(monthly)}</p>
        </div>
      </div>
    </div>
  );
}
