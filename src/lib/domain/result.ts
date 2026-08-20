import { Decimal, ZERO } from "./money";
import { isProfitAffecting, type FundedEntry } from "./funding-source";

export interface AmountEntry {
  amount: Decimal;
}

export type ExpenseEntry = AmountEntry & FundedEntry;

function sumAmounts(entries: readonly AmountEntry[]): Decimal {
  return entries.reduce<Decimal>((total, entry) => total.plus(entry.amount), ZERO);
}

/** BR-01 (counter-income component): sum of counter income for the period. */
export function totalCounterIncome(entries: readonly AmountEntry[]): Decimal {
  return sumAmounts(entries);
}

/**
 * BR-01 (party-income component): sum of party income for the period —
 * `party_income` already holds daily, monthly, and direct-cash-receipt
 * entries together in one table (FR-PINC-06/07), so no separate cash-
 * receipt total is needed here.
 */
export function totalPartyIncome(entries: readonly AmountEntry[]): Decimal {
  return sumAmounts(entries);
}

/** BR-01/FR-RES-04: total income = counter income + all party income. */
export function totalIncome(
  counterIncome: readonly AmountEntry[],
  partyIncome: readonly AmountEntry[],
): Decimal {
  return totalCounterIncome(counterIncome).plus(totalPartyIncome(partyIncome));
}

/**
 * BR-02/BR-04/FR-RES-05: total expenses = daily + monthly expenses in the
 * period whose funding source is Business, including machine instalments
 * (an instalment is just an ordinary `monthly_expenses` row with
 * `asset_id` set — no special-casing is needed here). BR-05/BR-06: a
 * Partner-funded expense is excluded entirely by `isProfitAffecting`.
 */
export function totalExpenses(
  dailyExpenses: readonly ExpenseEntry[],
  monthlyExpenses: readonly ExpenseEntry[],
): Decimal {
  const businessDaily = dailyExpenses.filter(isProfitAffecting);
  const businessMonthly = monthlyExpenses.filter(isProfitAffecting);
  return sumAmounts(businessDaily).plus(sumAmounts(businessMonthly));
}

/** BR-03/FR-RES-07: net profit or loss = total income − total expenses. */
export function netResult(income: Decimal, expenses: Decimal): Decimal {
  return income.minus(expenses);
}
