import { z } from "zod";
import { decimalAmountSchema } from "./money";

/**
 * Phase 7 historical import (FR-IMP-01/02) — one Zod schema per supported
 * sheet, each validating already-extracted plain-text cell values (see
 * src/lib/domain/import-cells.ts for the cell-shape gate that runs first).
 * Date/month strings are re-validated by `parseCalendarDate`/
 * `parseYearMonth` at the point they're actually converted (this schema
 * only checks the textual shape); amounts reuse the exact same
 * `decimalAmountSchema` every live entry screen validates against — no
 * separate, import-only notion of "a valid amount."
 */

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB (approved default)
export const MAX_IMPORT_ROWS_PER_SHEET = 5000; // approved default

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");
const yearMonthText = z.string().regex(/^\d{4}-\d{2}$/, "Expected a YYYY-MM period month.");
const nameText = z.string().trim().min(1).max(150);

export const importDailyExpenseRowSchema = z.object({
  date: dateText,
  itemName: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  amount: decimalAmountSchema({ allowZero: false }),
  fundingSource: z.enum(["BUSINESS", "PARTNER"]),
  fundedByName: nameText.optional(),
});

export const importMonthlyExpenseRowSchema = z.object({
  periodMonth: yearMonthText,
  categoryName: nameText,
  vendorName: nameText.optional(),
  amount: decimalAmountSchema({ allowZero: false }),
  fundingSource: z.enum(["BUSINESS", "PARTNER"]),
  fundedByName: nameText.optional(),
});

export const importPartyIncomeDailyRowSchema = z.object({
  date: dateText,
  partyName: nameText,
  amount: decimalAmountSchema({ allowZero: false }),
});

export const importPartyIncomeMonthlyBillRowSchema = z.object({
  periodMonth: yearMonthText,
  partyName: nameText,
  amount: decimalAmountSchema({ allowZero: false }),
});

export const importCounterIncomeRowSchema = z.object({
  date: dateText,
  amount: decimalAmountSchema({ allowZero: true }), // CLAUDE.md/DR: counter_income is the one table with CHECK amount >= 0
  note: z.string().trim().max(300).optional(),
});

export const importCapitalContributionRowSchema = z.object({
  date: dateText,
  partnerName: nameText,
  type: z.enum(["INITIAL", "INJECTION", "DRAWING"]),
  amount: decimalAmountSchema({ allowZero: false }),
});

export const IMPORT_SHEET_NAMES = [
  "Daily Expenses",
  "Monthly Expenses",
  "Party Income (Daily)",
  "Party Income (Monthly Bill)",
  "Counter Income",
  "Capital Contributions",
] as const;

export type ImportSheetName = (typeof IMPORT_SHEET_NAMES)[number];
