import { formatMoney } from "../../lib/domain/money-format";
import type { MonthlyResultTotals } from "../../server/queries/results";
import { InfoTip } from "../ui/InfoTip";

interface Props {
  split: MonthlyResultTotals["split"];
  netResult: string;
}

/**
 * FR-DASH / FR-RES-08 / BR-10 — two KPI cards showing each partner's
 * profit share for the current month.  Rendered only when `isConfigured`
 * is true (both partner user IDs are mapped in `app_settings`).
 *
 * This is a Server Component — no "use client" needed.
 */
export function ProfitSplitCards({ split, netResult }: Props) {
  if (!split.isConfigured || split.shareA === null || split.shareB === null) return null;

  const net = parseFloat(netResult);
  const isLoss = net < 0;

  const cards = [
    {
      name: split.partnerAName ?? "Partner A",
      percent: split.splitAPercent,
      share: split.shareA,
    },
    {
      name: split.partnerBName ?? "Partner B",
      percent: split.splitBPercent,
      share: split.shareB,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {cards.map((card) => (
        <div
          key={card.name}
          className="bg-surface-container-lowest border-outline-variant rounded-lg border p-4 shadow-[0px_1px_2px_rgba(18,48,71,0.08)]"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden>
              person
            </span>
            <p className="text-on-surface-variant flex items-center text-xs font-medium">
              <span className="uppercase tracking-wide">{card.name}&apos;s Share — This Month</span>
              <InfoTip>Calculated as Net Profit/Loss × the agreed split percentage. Losses are shared in the same ratio.</InfoTip>
            </p>
          </div>
          <p
            className={`tabular-nums mt-1 text-2xl font-bold ${
              isLoss ? "text-error" : "text-on-surface"
            }`}
          >
            {formatMoney(card.share)}
          </p>
          <p className="text-on-surface-variant mt-1 text-xs">
            {card.percent}% of net {isLoss ? "loss" : "profit"}
          </p>
        </div>
      ))}
    </div>
  );
}
