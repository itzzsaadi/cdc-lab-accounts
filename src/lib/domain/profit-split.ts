import { Decimal } from "./money";

export interface ProfitSplitInput {
  /** e.g. 50 for a 50% share. splitAPercent + splitBPercent must equal 100 — validated at the settings layer (Phase 7), not here. */
  splitAPercent: Decimal;
  netResult: Decimal;
}

export interface ProfitSplitResult {
  shareA: Decimal;
  shareB: Decimal;
}

/**
 * BR-10/FR-RES-08: divide the net result between exactly two partners
 * using the configured split, applying identically to a loss (BR-10 —
 * `netResult` may be negative; no special-casing here).
 *
 * Deterministic remainder rule (Phase 1 working rule, per the Phase 1 plan
 * — subject to confirmation before Phase 5): partner A's share is rounded
 * half-away-from-zero to 2 decimal places; partner B's share is defined as
 * the exact remainder (`netResult - shareA`), never independently rounded.
 * This guarantees `shareA + shareB === netResult` exactly in Decimal
 * arithmetic, and assigns any one-paisa rounding remainder to partner B
 * consistently, every time.
 *
 * BR-11: this function's signature has no parameter through which partner
 * investment data could enter — that is what "domain-function implemented"
 * means for BR-11 in the Phase 1 coverage matrix; it is not "end-to-end
 * verified" until the real Results feature demonstrates it (Phase 5).
 */
export function splitProfit({ splitAPercent, netResult }: ProfitSplitInput): ProfitSplitResult {
  const shareA = netResult
    .times(splitAPercent)
    .dividedBy(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const shareB = netResult.minus(shareA);
  return { shareA, shareB };
}
