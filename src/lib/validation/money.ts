import { z } from "zod";

/**
 * The one shared decimal-amount validator for every Phase 3B entry
 * (CLAUDE.md §9/§10, mandatory safeguard #3). Amounts travel as plain
 * strings from the browser to the server — never through `z.coerce.number()`,
 * `parseFloat`, `Number()`, or an arithmetic operator. This validator only
 * inspects the string's *shape* (digit-by-digit regex matching); the value
 * is converted to `Prisma.Decimal` exactly once, at the point a server
 * action constructs the Prisma `data` object, and every subsequent
 * calculation reuses `src/lib/domain/money.ts`'s `Decimal`, never a JS
 * `number`.
 *
 * Matches `NUMERIC(14,2)`: up to 12 integer digits, an optional 2-digit
 * fractional part — never more precision than the column can store.
 */
const DECIMAL_STRING_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/** True for "0", "0.0", "00.00", etc. — checked by regex, never by `Number(value) === 0`, so this stays entirely string-based. */
function isZeroAmountString(value: string): boolean {
  return /^0+(\.0+)?$/.test(value);
}

export function decimalAmountSchema(options: { allowZero: boolean }) {
  return z
    .string()
    .trim()
    .regex(DECIMAL_STRING_PATTERN, "Enter a valid amount (digits only, up to 2 decimal places).")
    .refine((value) => options.allowZero || !isZeroAmountString(value), {
      message: "Amount must be greater than zero.",
    });
}
