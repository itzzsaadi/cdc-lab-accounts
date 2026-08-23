/**
 * Phase 7 historical import (FR-IMP-01/02) — the one place a raw exceljs
 * cell value is turned into a plain string for further Zod validation.
 * Every function here rejects rather than coerces: a formula cell, a rich-
 * text run, or a numeric Excel date/amount cell is refused outright, never
 * silently accepted via `.toString()` — the template requires Text-
 * formatted date/month/amount columns specifically so this module never
 * has to guess at Excel's own numeric-date or floating-point-amount
 * representation (both of which this project avoids everywhere else,
 * DR-01/DR-02/CON-01).
 */
export class UnsafeImportCellError extends Error {}

function isPlainTextCell(value: unknown): value is string {
  return typeof value === "string";
}

/** A cell is a formula if exceljs returns an object shaped `{formula, result}` rather than a primitive — checked generically (not via `instanceof`) since exceljs's own formula-value shape is a plain object, not a class instance. */
export function isFormulaCellValue(value: unknown): boolean {
  return (
    typeof value === "object" && value !== null && "formula" in (value as Record<string, unknown>)
  );
}

/** Returns the trimmed cell text, or throws `UnsafeImportCellError` for anything that isn't a plain string cell (formula, rich text, numeric, Date object, null). Callers pass the result into the existing `decimalAmountSchema`/`parseCalendarDate`/`parseYearMonth` validators — this function only gates *shape*, never interprets the value itself. */
export function extractImportCellText(value: unknown, columnLabel: string): string {
  if (isFormulaCellValue(value)) {
    throw new UnsafeImportCellError(`${columnLabel}: formula cells are not permitted.`);
  }
  if (!isPlainTextCell(value)) {
    throw new UnsafeImportCellError(
      `${columnLabel}: expected a plain text cell (re-save this column as Text format).`,
    );
  }
  return value.trim();
}

/** Same gate as `extractImportCellText`, but blank/undefined is a legitimate "not provided" for an optional column (e.g. Vendor Name, Note) — returns `undefined` rather than throwing. */
export function extractOptionalImportCellText(
  value: unknown,
  columnLabel: string,
): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const text = extractImportCellText(value, columnLabel);
  return text === "" ? undefined : text;
}
