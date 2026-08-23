import ExcelJS from "exceljs";
import {
  extractImportCellText,
  extractOptionalImportCellText,
  UnsafeImportCellError,
} from "../../lib/domain/import-cells";
import { parseCalendarDate, parseYearMonth } from "../../lib/domain/calendar-date";
import {
  IMPORT_SHEET_NAMES,
  MAX_IMPORT_ROWS_PER_SHEET,
  importDailyExpenseRowSchema,
  importMonthlyExpenseRowSchema,
  importPartyIncomeDailyRowSchema,
  importPartyIncomeMonthlyBillRowSchema,
  importCounterIncomeRowSchema,
  importCapitalContributionRowSchema,
} from "../../lib/validation/import";

const XLSX_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" — a .xlsx is a ZIP archive
const XLS_OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // legacy .xls / OLE2 compound file

export class MalformedImportFileError extends Error {}

/** Checked before exceljs ever sees the buffer — a renamed non-Excel file is refused immediately, not handed to the parser. Accepts `Uint8Array` (not just `Buffer`) so callers passing either a freshly-read `Buffer` or Prisma's `Bytes`-typed column value both work without a generic-parameter mismatch. */
export function assertValidWorkbookSignature(input: Uint8Array): void {
  const buffer = Buffer.from(input);
  if (buffer.length < 4) {
    throw new MalformedImportFileError("File is too small to be a valid .xlsx workbook.");
  }
  const head = buffer.subarray(0, 4);
  if (head.equals(XLS_OLE_SIGNATURE)) {
    throw new MalformedImportFileError(
      "This looks like a legacy .xls file — please save it as .xlsx and try again.",
    );
  }
  if (!head.equals(XLSX_SIGNATURE)) {
    throw new MalformedImportFileError(
      "This file is not a valid .xlsx workbook (unrecognized file signature).",
    );
  }
}

export interface MasterDataResolvers {
  resolveParty(name: string): { id: string; isActive: boolean } | null;
  resolveExpenseItem(name: string): { id: string; isActive: boolean } | null;
  resolveExpenseCategory(name: string): { id: string; isActive: boolean } | null;
  resolveVendor(name: string): { id: string; isActive: boolean } | null;
  /** Resolves a "Funded By" / "Partner Name" cell against users with is_partner = true — an import row can never name a non-partner as the funding/contributing partner, same rule the live entry screens enforce (and the database's own reject_if_not_partner trigger enforces regardless). */
  resolvePartnerUser(name: string): { id: string; isActive: boolean } | null;
}

export interface ImportRowIssue {
  sheet: ImportSheetKey;
  row: number;
  message: string;
}

export type ImportSheetKey =
  | "dailyExpenses"
  | "monthlyExpenses"
  | "partyIncomeDaily"
  | "partyIncomeMonthlyBill"
  | "counterIncome"
  | "capitalContributions";

const SHEET_KEY_BY_NAME: Record<(typeof IMPORT_SHEET_NAMES)[number], ImportSheetKey> = {
  "Daily Expenses": "dailyExpenses",
  "Monthly Expenses": "monthlyExpenses",
  "Party Income (Daily)": "partyIncomeDaily",
  "Party Income (Monthly Bill)": "partyIncomeMonthlyBill",
  "Counter Income": "counterIncome",
  "Capital Contributions": "capitalContributions",
};

export interface ValidatedDailyExpenseRow {
  row: number;
  expenseDate: string;
  expenseItemId?: string;
  customDescription?: string;
  amount: string;
  fundingSource: "BUSINESS" | "PARTNER";
  fundedByUserId?: string;
}
export interface ValidatedMonthlyExpenseRow {
  row: number;
  periodMonth: string;
  categoryId: string;
  vendorId?: string;
  amount: string;
  fundingSource: "BUSINESS" | "PARTNER";
  fundedByUserId?: string;
}
export interface ValidatedPartyIncomeDailyRow {
  row: number;
  incomeDate: string;
  partyId: string;
  amount: string;
}
export interface ValidatedPartyIncomeMonthlyBillRow {
  row: number;
  periodMonth: string;
  partyId: string;
  amount: string;
}
export interface ValidatedCounterIncomeRow {
  row: number;
  incomeDate: string;
  amount: string;
  note?: string;
}
export interface ValidatedCapitalContributionRow {
  row: number;
  entryDate: string;
  partnerUserId: string;
  contributionType: "INITIAL" | "INJECTION" | "DRAWING";
  amount: string;
}

export interface ParsedImportResult {
  dailyExpenses: ValidatedDailyExpenseRow[];
  monthlyExpenses: ValidatedMonthlyExpenseRow[];
  partyIncomeDaily: ValidatedPartyIncomeDailyRow[];
  partyIncomeMonthlyBill: ValidatedPartyIncomeMonthlyBillRow[];
  counterIncome: ValidatedCounterIncomeRow[];
  capitalContributions: ValidatedCapitalContributionRow[];
  issues: ImportRowIssue[];
  totalRows: number;
}

function emptyResult(): ParsedImportResult {
  return {
    dailyExpenses: [],
    monthlyExpenses: [],
    partyIncomeDaily: [],
    partyIncomeMonthlyBill: [],
    counterIncome: [],
    capitalContributions: [],
    issues: [],
    totalRows: 0,
  };
}

/**
 * Reads every data row of one worksheet into `Record<header, cellText>`,
 * rejecting a formula cell or a non-text cell immediately (via
 * `extractImportCellText`/`extractOptionalImportCellText`) and enforcing
 * the exact expected header row — unexpected, missing, or duplicate
 * columns are all rejected rather than silently ignored or reordered.
 */
function readSheetRows(
  worksheet: ExcelJS.Worksheet,
  columns: { header: string; key: string; optional?: boolean }[],
  sheetKey: ImportSheetKey,
  issues: ImportRowIssue[],
): Record<string, string | undefined>[] {
  const headerRow = worksheet.getRow(1);
  const actualHeaders: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    actualHeaders.push(String(cell.value ?? "").trim());
  });
  const expectedHeaders = columns.map((c) => c.header);
  const seen = new Set<string>();
  for (const header of actualHeaders) {
    if (seen.has(header)) {
      issues.push({ sheet: sheetKey, row: 1, message: `Duplicate column header "${header}".` });
      return [];
    }
    seen.add(header);
  }
  if (
    actualHeaders.length !== expectedHeaders.length ||
    !expectedHeaders.every((header, index) => actualHeaders[index] === header)
  ) {
    issues.push({
      sheet: sheetKey,
      row: 1,
      message: `Unexpected columns. Expected exactly: ${expectedHeaders.join(", ")}.`,
    });
    return [];
  }

  const rows: Record<string, string | undefined>[] = [];
  const rowCount = worksheet.actualRowCount;
  if (rowCount - 1 > MAX_IMPORT_ROWS_PER_SHEET) {
    issues.push({
      sheet: sheetKey,
      row: 0,
      message: `Sheet has more than ${MAX_IMPORT_ROWS_PER_SHEET} data rows — split the import into smaller files.`,
    });
    return [];
  }

  for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
    const excelRow = worksheet.getRow(rowNumber);
    if (excelRow.cellCount === 0) continue; // exceljs can report trailing blank rows within actualRowCount
    const record: Record<string, string | undefined> = {};
    let rowHadError = false;
    columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      try {
        record[column.key] = column.optional
          ? extractOptionalImportCellText(cell.value, column.header)
          : extractImportCellText(cell.value, column.header);
      } catch (error) {
        if (error instanceof UnsafeImportCellError) {
          issues.push({ sheet: sheetKey, row: rowNumber, message: error.message });
          rowHadError = true;
        } else {
          throw error;
        }
      }
    });
    if (!rowHadError) {
      rows.push(record);
    }
  }
  return rows;
}

function resolveFundedBy(
  fundingSource: "BUSINESS" | "PARTNER",
  fundedByName: string | undefined,
  resolvers: MasterDataResolvers,
  sheetKey: ImportSheetKey,
  row: number,
  issues: ImportRowIssue[],
): string | undefined {
  if (fundingSource === "BUSINESS") {
    return undefined;
  }
  if (!fundedByName) {
    issues.push({
      sheet: sheetKey,
      row,
      message: "Funding Source is Partner but Funded By is blank.",
    });
    return undefined;
  }
  const partner = resolvers.resolvePartnerUser(fundedByName);
  if (!partner) {
    issues.push({
      sheet: sheetKey,
      row,
      message: `Funded By "${fundedByName}" does not match any partner.`,
    });
    return undefined;
  }
  if (!partner.isActive) {
    issues.push({
      sheet: sheetKey,
      row,
      message: `Funded By "${fundedByName}" is an inactive account.`,
    });
    return undefined;
  }
  return partner.id;
}

/**
 * The single parsing pipeline both preview and commit call — commit calls
 * it a second time, from scratch, against the exact bytes claimed from
 * `ImportSession` (never against anything the browser echoed back from
 * preview). `resolvers` is built fresh by the caller each time from a
 * live master-data query, so a party archived between preview and commit
 * is caught on re-parse, not just at preview time.
 */
export async function parseImportWorkbook(
  input: Uint8Array,
  resolvers: MasterDataResolvers,
): Promise<ParsedImportResult> {
  assertValidWorkbookSignature(input);
  const buffer = Buffer.from(input);

  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's own .d.ts pins a non-generic `Buffer` that this project's
    // newer @types/node generic `Buffer<T>` doesn't structurally match —
    // a real Node Buffer at runtime either way, so this cast is purely
    // about the two ambient type declarations disagreeing, not a real
    // type hazard.
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new MalformedImportFileError("This file could not be read as an Excel workbook.");
  }

  const result = emptyResult();
  const sheetNamesInFile = workbook.worksheets.map((ws) => ws.name);
  const seenSheetNames = new Set<string>();
  for (const name of sheetNamesInFile) {
    if (seenSheetNames.has(name)) {
      result.issues.push({
        sheet: "dailyExpenses",
        row: 0,
        message: `Duplicate sheet name "${name}" in the workbook.`,
      });
      return result;
    }
    seenSheetNames.add(name);
  }
  const unsupported = sheetNamesInFile.filter(
    (name) => !IMPORT_SHEET_NAMES.includes(name as (typeof IMPORT_SHEET_NAMES)[number]),
  );
  if (unsupported.length > 0) {
    result.issues.push({
      sheet: "dailyExpenses",
      row: 0,
      message: `Unsupported sheet(s): ${unsupported.join(", ")}. Only ${IMPORT_SHEET_NAMES.join(", ")} are supported.`,
    });
    return result;
  }

  parseDailyExpensesSheet(workbook, resolvers, result);
  parseMonthlyExpensesSheet(workbook, resolvers, result);
  parsePartyIncomeDailySheet(workbook, resolvers, result);
  parsePartyIncomeMonthlyBillSheet(workbook, resolvers, result);
  parseCounterIncomeSheet(workbook, result);
  parseCapitalContributionsSheet(workbook, resolvers, result);

  result.totalRows =
    result.dailyExpenses.length +
    result.monthlyExpenses.length +
    result.partyIncomeDaily.length +
    result.partyIncomeMonthlyBill.length +
    result.counterIncome.length +
    result.capitalContributions.length;

  // Within-file duplicate detection, matching each entity's own live rule.
  checkPartyIncomeDailyDuplicates(result);

  return result;
}

function parseDailyExpensesSheet(
  workbook: ExcelJS.Workbook,
  resolvers: MasterDataResolvers,
  result: ParsedImportResult,
) {
  const sheet = workbook.getWorksheet("Daily Expenses");
  if (!sheet) return;
  const rows = readSheetRows(
    sheet,
    [
      { header: "Date", key: "date" },
      { header: "Item Name", key: "itemName", optional: true },
      { header: "Description", key: "description", optional: true },
      { header: "Amount", key: "amount" },
      { header: "Funding Source", key: "fundingSource" },
      { header: "Funded By", key: "fundedByName", optional: true },
    ],
    "dailyExpenses",
    result.issues,
  );
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const parsed = importDailyExpenseRowSchema.safeParse({
      date: raw.date,
      itemName: raw.itemName,
      description: raw.description,
      amount: raw.amount,
      fundingSource: raw.fundingSource,
      fundedByName: raw.fundedByName,
    });
    if (!parsed.success) {
      result.issues.push({
        sheet: "dailyExpenses",
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? "Invalid row.",
      });
      return;
    }
    const data = parsed.data;
    if (!parseCalendarDate(data.date)) {
      result.issues.push({
        sheet: "dailyExpenses",
        row: rowNumber,
        message: `Invalid date "${data.date}".`,
      });
      return;
    }
    let expenseItemId: string | undefined;
    if (data.itemName) {
      const item = resolvers.resolveExpenseItem(data.itemName);
      if (!item) {
        result.issues.push({
          sheet: "dailyExpenses",
          row: rowNumber,
          message: `Item Name "${data.itemName}" does not match any expense item.`,
        });
        return;
      }
      if (!item.isActive) {
        result.issues.push({
          sheet: "dailyExpenses",
          row: rowNumber,
          message: `Item Name "${data.itemName}" is archived.`,
        });
        return;
      }
      expenseItemId = item.id;
    } else if (!data.description) {
      result.issues.push({
        sheet: "dailyExpenses",
        row: rowNumber,
        message: "Either Item Name or Description is required.",
      });
      return;
    }
    const fundedByUserId = resolveFundedBy(
      data.fundingSource,
      data.fundedByName,
      resolvers,
      "dailyExpenses",
      rowNumber,
      result.issues,
    );
    if (data.fundingSource === "PARTNER" && !fundedByUserId) return;
    result.dailyExpenses.push({
      row: rowNumber,
      expenseDate: data.date,
      expenseItemId,
      customDescription: data.description,
      amount: data.amount,
      fundingSource: data.fundingSource,
      fundedByUserId,
    });
  });
}

function parseMonthlyExpensesSheet(
  workbook: ExcelJS.Workbook,
  resolvers: MasterDataResolvers,
  result: ParsedImportResult,
) {
  const sheet = workbook.getWorksheet("Monthly Expenses");
  if (!sheet) return;
  const rows = readSheetRows(
    sheet,
    [
      { header: "Period Month", key: "periodMonth" },
      { header: "Category Name", key: "categoryName" },
      { header: "Vendor Name", key: "vendorName", optional: true },
      { header: "Amount", key: "amount" },
      { header: "Funding Source", key: "fundingSource" },
      { header: "Funded By", key: "fundedByName", optional: true },
    ],
    "monthlyExpenses",
    result.issues,
  );
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const parsed = importMonthlyExpenseRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.issues.push({
        sheet: "monthlyExpenses",
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? "Invalid row.",
      });
      return;
    }
    const data = parsed.data;
    if (!parseYearMonth(data.periodMonth)) {
      result.issues.push({
        sheet: "monthlyExpenses",
        row: rowNumber,
        message: `Invalid period month "${data.periodMonth}".`,
      });
      return;
    }
    const category = resolvers.resolveExpenseCategory(data.categoryName);
    if (!category) {
      result.issues.push({
        sheet: "monthlyExpenses",
        row: rowNumber,
        message: `Category Name "${data.categoryName}" does not match any expense category.`,
      });
      return;
    }
    if (!category.isActive) {
      result.issues.push({
        sheet: "monthlyExpenses",
        row: rowNumber,
        message: `Category Name "${data.categoryName}" is archived.`,
      });
      return;
    }
    let vendorId: string | undefined;
    if (data.vendorName) {
      const vendor = resolvers.resolveVendor(data.vendorName);
      if (!vendor) {
        result.issues.push({
          sheet: "monthlyExpenses",
          row: rowNumber,
          message: `Vendor Name "${data.vendorName}" does not match any vendor.`,
        });
        return;
      }
      if (!vendor.isActive) {
        result.issues.push({
          sheet: "monthlyExpenses",
          row: rowNumber,
          message: `Vendor Name "${data.vendorName}" is archived.`,
        });
        return;
      }
      vendorId = vendor.id;
    }
    const fundedByUserId = resolveFundedBy(
      data.fundingSource,
      data.fundedByName,
      resolvers,
      "monthlyExpenses",
      rowNumber,
      result.issues,
    );
    if (data.fundingSource === "PARTNER" && !fundedByUserId) return;
    result.monthlyExpenses.push({
      row: rowNumber,
      periodMonth: data.periodMonth,
      categoryId: category.id,
      vendorId,
      amount: data.amount,
      fundingSource: data.fundingSource,
      fundedByUserId,
    });
  });
}

function parsePartyIncomeDailySheet(
  workbook: ExcelJS.Workbook,
  resolvers: MasterDataResolvers,
  result: ParsedImportResult,
) {
  const sheet = workbook.getWorksheet("Party Income (Daily)");
  if (!sheet) return;
  const rows = readSheetRows(
    sheet,
    [
      { header: "Date", key: "date" },
      { header: "Party Name", key: "partyName" },
      { header: "Amount", key: "amount" },
    ],
    "partyIncomeDaily",
    result.issues,
  );
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const parsed = importPartyIncomeDailyRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.issues.push({
        sheet: "partyIncomeDaily",
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? "Invalid row.",
      });
      return;
    }
    const data = parsed.data;
    if (!parseCalendarDate(data.date)) {
      result.issues.push({
        sheet: "partyIncomeDaily",
        row: rowNumber,
        message: `Invalid date "${data.date}".`,
      });
      return;
    }
    const party = resolvers.resolveParty(data.partyName);
    if (!party) {
      result.issues.push({
        sheet: "partyIncomeDaily",
        row: rowNumber,
        message: `Party Name "${data.partyName}" does not match any party.`,
      });
      return;
    }
    if (!party.isActive) {
      result.issues.push({
        sheet: "partyIncomeDaily",
        row: rowNumber,
        message: `Party Name "${data.partyName}" is archived.`,
      });
      return;
    }
    result.partyIncomeDaily.push({
      row: rowNumber,
      incomeDate: data.date,
      partyId: party.id,
      amount: data.amount,
    });
  });
}

function parsePartyIncomeMonthlyBillSheet(
  workbook: ExcelJS.Workbook,
  resolvers: MasterDataResolvers,
  result: ParsedImportResult,
) {
  const sheet = workbook.getWorksheet("Party Income (Monthly Bill)");
  if (!sheet) return;
  const rows = readSheetRows(
    sheet,
    [
      { header: "Period Month", key: "periodMonth" },
      { header: "Party Name", key: "partyName" },
      { header: "Amount", key: "amount" },
    ],
    "partyIncomeMonthlyBill",
    result.issues,
  );
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const parsed = importPartyIncomeMonthlyBillRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.issues.push({
        sheet: "partyIncomeMonthlyBill",
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? "Invalid row.",
      });
      return;
    }
    const data = parsed.data;
    if (!parseYearMonth(data.periodMonth)) {
      result.issues.push({
        sheet: "partyIncomeMonthlyBill",
        row: rowNumber,
        message: `Invalid period month "${data.periodMonth}".`,
      });
      return;
    }
    const party = resolvers.resolveParty(data.partyName);
    if (!party) {
      result.issues.push({
        sheet: "partyIncomeMonthlyBill",
        row: rowNumber,
        message: `Party Name "${data.partyName}" does not match any party.`,
      });
      return;
    }
    if (!party.isActive) {
      result.issues.push({
        sheet: "partyIncomeMonthlyBill",
        row: rowNumber,
        message: `Party Name "${data.partyName}" is archived.`,
      });
      return;
    }
    result.partyIncomeMonthlyBill.push({
      row: rowNumber,
      periodMonth: data.periodMonth,
      partyId: party.id,
      amount: data.amount,
    });
  });
}

function parseCounterIncomeSheet(workbook: ExcelJS.Workbook, result: ParsedImportResult) {
  const sheet = workbook.getWorksheet("Counter Income");
  if (!sheet) return;
  const rows = readSheetRows(
    sheet,
    [
      { header: "Date", key: "date" },
      { header: "Amount", key: "amount" },
      { header: "Note", key: "note", optional: true },
    ],
    "counterIncome",
    result.issues,
  );
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const parsed = importCounterIncomeRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.issues.push({
        sheet: "counterIncome",
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? "Invalid row.",
      });
      return;
    }
    const data = parsed.data;
    if (!parseCalendarDate(data.date)) {
      result.issues.push({
        sheet: "counterIncome",
        row: rowNumber,
        message: `Invalid date "${data.date}".`,
      });
      return;
    }
    result.counterIncome.push({
      row: rowNumber,
      incomeDate: data.date,
      amount: data.amount,
      note: data.note,
    });
  });
}

function parseCapitalContributionsSheet(
  workbook: ExcelJS.Workbook,
  resolvers: MasterDataResolvers,
  result: ParsedImportResult,
) {
  const sheet = workbook.getWorksheet("Capital Contributions");
  if (!sheet) return;
  const rows = readSheetRows(
    sheet,
    [
      { header: "Date", key: "date" },
      { header: "Partner Name", key: "partnerName" },
      { header: "Type", key: "type" },
      { header: "Amount", key: "amount" },
    ],
    "capitalContributions",
    result.issues,
  );
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const parsed = importCapitalContributionRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.issues.push({
        sheet: "capitalContributions",
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? "Invalid row.",
      });
      return;
    }
    const data = parsed.data;
    if (!parseCalendarDate(data.date)) {
      result.issues.push({
        sheet: "capitalContributions",
        row: rowNumber,
        message: `Invalid date "${data.date}".`,
      });
      return;
    }
    const partner = resolvers.resolvePartnerUser(data.partnerName);
    if (!partner) {
      result.issues.push({
        sheet: "capitalContributions",
        row: rowNumber,
        message: `Partner Name "${data.partnerName}" does not match any partner.`,
      });
      return;
    }
    if (!partner.isActive) {
      result.issues.push({
        sheet: "capitalContributions",
        row: rowNumber,
        message: `Partner Name "${data.partnerName}" is an inactive account.`,
      });
      return;
    }
    result.capitalContributions.push({
      row: rowNumber,
      entryDate: data.date,
      partnerUserId: partner.id,
      contributionType: data.type,
      amount: data.amount,
    });
  });
}

/** Daily-billing party income is one cell per party+date, matching the live entry grid's own constraint (party_income_active_daily_cell_unique) — a second row for the same party+date within one import file is a hard reject, not a silent overwrite. */
function checkPartyIncomeDailyDuplicates(result: ParsedImportResult) {
  const seen = new Map<string, number>();
  for (const row of result.partyIncomeDaily) {
    const key = `${row.partyId}:${row.incomeDate}`;
    const firstRow = seen.get(key);
    if (firstRow !== undefined) {
      result.issues.push({
        sheet: "partyIncomeDaily",
        row: row.row,
        message: `Duplicate entry for this party and date — already used at row ${firstRow}.`,
      });
    } else {
      seen.set(key, row.row);
    }
  }
}

export { SHEET_KEY_BY_NAME };
