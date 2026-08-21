const DANGEROUS_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Formula-injection protection for a free-text cell (description, note,
 * category/vendor/party name) in an exported spreadsheet — never applied
 * to a monetary cell, which is always written as a raw signed `number`
 * (see `../../lib/domain/decimal-export.ts`), not a formatted string, so
 * this guard never needs to reason about a legitimately negative amount.
 */
export function sanitizeTextCell(value: string): string {
  return DANGEROUS_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

/** Built only from internally validated/self-generated values — a period label already validated as `YYYY-MM`/`YYYY-MM-DD`, never raw user input — so there is no path-traversal or header-injection surface. */
export function safeReportFilename(
  periodLabel: string,
  generatedAt: Date,
  extension: "pdf" | "xlsx",
): string {
  const stamp = generatedAt.toISOString().replace(/[-:]/g, "").split(".")[0];
  return `monthly-summary-${periodLabel}-generated-${stamp}.${extension}`;
}
