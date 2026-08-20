/**
 * The funding-source rule (BR-02/05/06/07, DR-07, CLAUDE.md §7). This
 * module is intentionally framework-agnostic: it defines its own literal
 * type rather than importing the generated Prisma enum, so it stays
 * importable and testable with no database or ORM dependency at all.
 */
export type FundingSource = "BUSINESS" | "PARTNER";

export interface FundedEntry {
  fundingSource: FundingSource;
}

/** BR-02: only BUSINESS-funded expenses reduce profit. */
export function isProfitAffecting(entry: FundedEntry): boolean {
  return entry.fundingSource === "BUSINESS";
}

/** BR-05/BR-06: a PARTNER-funded expense is excluded from profit entirely. */
export function isExcludedFromProfit(entry: FundedEntry): boolean {
  return entry.fundingSource === "PARTNER";
}
