import { Decimal } from "./money";

/**
 * Thrown when a monetary `Decimal` cannot be safely represented as an
 * Excel numeric cell — the export must fail rather than silently write a
 * lossy or incorrect figure (FR-RPT-06/07, DR-01).
 */
export class UnsafeDecimalExportError extends Error {}

/**
 * The single, narrow boundary where a monetary `Decimal` becomes a JS
 * `number` — used only immediately before writing an exceljs numeric cell,
 * never for any calculation. Every step below is a defensive check, not an
 * assumption that `Number(decimal.toString())` is lossless:
 *
 * 1. Reject more than 2 fractional digits (every monetary column is
 *    `NUMERIC(14,2)`, so a well-formed value never has more, but this is
 *    checked rather than trusted).
 * 2. Reject a scaled-cent integer (`amount × 100`) outside
 *    `Number.MAX_SAFE_INTEGER` — the magnitude bound under which integer
 *    arithmetic in a JS `number` is exact.
 * 3. Convert once, here, via `Decimal#toNumber()`.
 * 4. Reconstruct a `Decimal` from the produced `number` and verify it is
 *    equal to the original at 2 decimal places.
 * 5. Throw `UnsafeDecimalExportError` — never write a silently-wrong cell —
 *    if the round trip disagrees.
 *
 * No arithmetic is ever performed on the returned `number`; it is written
 * directly into an exceljs cell and nothing else touches it.
 */
export function toSafeExcelNumber(amount: Decimal): number {
  if (amount.decimalPlaces() > 2) {
    throw new UnsafeDecimalExportError(
      `Refusing to export ${amount.toString()}: more than 2 fractional digits.`,
    );
  }

  const scaledCents = amount.times(100);
  if (!scaledCents.isInteger() || scaledCents.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new UnsafeDecimalExportError(
      `Refusing to export ${amount.toString()}: outside the safe-integer range at cent scale.`,
    );
  }

  const numeric = amount.toNumber();
  const roundTripped = new Decimal(numeric).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const original = amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!roundTripped.equals(original)) {
    throw new UnsafeDecimalExportError(
      `Refusing to export ${amount.toString()}: round-trip through Number produced ${roundTripped.toString()}.`,
    );
  }

  return numeric;
}
