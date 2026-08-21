import type { Decimal } from "./money";

/**
 * The one reusable, Decimal-safe money display formatter for Phase 3B
 * (CLAUDE.md §9/§10). Accepts a `Decimal` or an already-validated decimal
 * string and produces `"Rs 1,234.56"` (or `"Rs -1,234.56"` for a negative
 * value, `"Rs 0.00"` for zero) — thousands separators, always two decimal
 * places.
 *
 * Deliberately pure string manipulation, with only a *type-only* import of
 * `Decimal` (erased at compile time — this module never imports the
 * generated Prisma client's runtime value). A `Decimal` argument is
 * converted via its own `toString()` — a plain method every object has,
 * not a Decimal-specific one — never `Number()`, `parseFloat`, or
 * `.toNumber()`, and never an arithmetic operator. This matters beyond
 * decimal-safety: the generated Prisma client is a Node-only module, and
 * this formatter is called from **client** components (`PartyIncomeGrid`,
 * `CashReceiptModal`) as well as server ones — importing the real
 * `Prisma.Decimal` class here (even indirectly, as an earlier version of
 * this file did through `src/lib/domain/money.ts`'s `Decimal` value
 * export) makes Turbopack try to bundle the whole generated client into
 * the browser and fail outright ("does not support external modules
 * (request: node:module)"). Every value actually passed in from a client
 * component is already a plain string in practice (Server → Client props
 * must be serializable, so a live `Decimal` instance could never legally
 * cross that boundary either) — the `Decimal` branch here exists only for
 * server-side callers holding a real Prisma row value.
 */
export function formatMoney(amount: Decimal | string): string {
  const raw = (typeof amount === "string" ? amount : amount.toString()).trim();
  const isNegative = raw.startsWith("-");
  const unsigned = isNegative ? raw.slice(1) : raw;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  // NUMERIC(14,2) never carries more than 2 fractional digits by the time
  // it reaches this formatter — padded (not rounded) up to 2, since every
  // real value flowing through this app's Zod validation already has at
  // most 2.
  const fraction = (fractionPart + "00").slice(0, 2);
  const isZero = /^0*$/.test(whole) && /^0*$/.test(fraction);
  const withSeparators = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs ${isNegative && !isZero ? "-" : ""}${withSeparators}.${fraction}`;
}
