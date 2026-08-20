import { Decimal, ZERO } from "./money";

export type ContributionType = "INITIAL" | "INJECTION" | "DRAWING";

export interface CapitalContributionEntry {
  partnerUserId: string;
  amount: Decimal;
  contributionType: ContributionType;
}

export interface PartnerFundedExpenseEntry {
  fundedByUserId: string | null;
  amount: Decimal;
}

export interface CashAssetEntry {
  purchasedByUserId: string | null;
  purchasePrice: Decimal;
}

/**
 * FR-INV-02/BR-06/BR-08/BR-11: a partner's investment total is the sum of
 * direct capital contributions, partner-funded expenses, and cash-bought
 * assets recorded against them — never the profit split (this function
 * takes no split/result input at all, structurally enforcing BR-11).
 *
 * `capital_contributions.amount` is always stored positive (SRS §6, DR-01
 * — no signed monetary columns); `contributionType = 'DRAWING'` is what
 * reduces the total, made explicit here rather than relying on a stored
 * sign.
 */
export function partnerInvestmentTotal(
  partnerUserId: string,
  contributions: readonly CapitalContributionEntry[],
  partnerFundedExpenses: readonly PartnerFundedExpenseEntry[],
  cashAssets: readonly CashAssetEntry[],
): Decimal {
  const contributionTotal = contributions
    .filter((entry) => entry.partnerUserId === partnerUserId)
    .reduce<Decimal>((total, entry) => {
      const signedAmount =
        entry.contributionType === "DRAWING" ? entry.amount.negated() : entry.amount;
      return total.plus(signedAmount);
    }, ZERO);

  const fundedExpenseTotal = partnerFundedExpenses
    .filter((entry) => entry.fundedByUserId === partnerUserId)
    .reduce<Decimal>((total, entry) => total.plus(entry.amount), ZERO);

  const cashAssetTotal = cashAssets
    .filter((entry) => entry.purchasedByUserId === partnerUserId)
    .reduce<Decimal>((total, entry) => total.plus(entry.purchasePrice), ZERO);

  return contributionTotal.plus(fundedExpenseTotal).plus(cashAssetTotal);
}
