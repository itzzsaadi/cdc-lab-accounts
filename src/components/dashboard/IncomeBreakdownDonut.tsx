"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { InfoTip } from "../ui/InfoTip";

function formatTooltipMoney(value: number): string {
  return `Rs ${value.toLocaleString("en-PK")}`;
}

interface Props {
  totalCounterIncome: string;
  totalPartyIncome: string;
  title?: string;
}

/**
 * Donut chart: Counter Income vs Party Income for the current month.
 * Helps partners see which revenue stream is driving results at a glance.
 *
 * Values arrive as Decimal strings; converted to number only at the
 * rendering boundary (CLAUDE.md §10).
 */
export function IncomeBreakdownDonut({
  totalCounterIncome,
  totalPartyIncome,
  title,
}: Props) {
  const counter = parseFloat(totalCounterIncome);
  const party = parseFloat(totalPartyIncome);
  const total = counter + party;

  if (total === 0) {
    return (
      <p className="text-on-surface-variant flex h-full items-center justify-center py-8 text-sm">
        No income recorded this month.
      </p>
    );
  }

  const data = [
    { name: "Counter Income", value: counter },
    { name: "Party Income", value: party },
  ];

  const COLORS = [
    "var(--color-primary, #0072b1)",
    "var(--color-secondary, #4a6373)",
  ];

  const pct = (val: number) => total > 0 ? `${((val / total) * 100).toFixed(1)}%` : "—";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="text-on-surface-variant text-xs font-medium">
          {title ?? "Income Sources"}
        </span>
        <InfoTip>Counter Income is from walk-in patient fees. Party Income is from referral fees from affiliated clinics and hospitals.</InfoTip>
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
          <p className="text-on-surface-variant">Counter</p>
          <p className="text-on-surface font-semibold tabular-nums">{pct(counter)}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">Party</p>
          <p className="text-on-surface font-semibold tabular-nums">{pct(party)}</p>
        </div>
      </div>
    </div>
  );
}
