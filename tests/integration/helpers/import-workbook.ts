import ExcelJS from "exceljs";
import { IMPORT_SHEET_NAMES } from "../../../src/lib/validation/import";

export type ImportWorkbookSheets = Partial<
  Record<(typeof IMPORT_SHEET_NAMES)[number], { headers: string[]; rows: (string | undefined)[][] }>
>;

/** Builds a real .xlsx buffer in memory for import-pipeline integration tests — every data cell is a plain JS string, never a number/Date/formula, matching what the approved Excel template asks a real user to produce (Text-formatted columns). */
export async function buildImportWorkbook(sheets: ImportWorkbookSheets): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const [sheetName, sheet] of Object.entries(sheets)) {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.addRow(sheet!.headers);
    for (const row of sheet!.rows) {
      worksheet.addRow(row);
    }
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export const DAILY_EXPENSES_HEADERS = [
  "Date",
  "Item Name",
  "Description",
  "Amount",
  "Funding Source",
  "Funded By",
];
export const MONTHLY_EXPENSES_HEADERS = [
  "Period Month",
  "Category Name",
  "Vendor Name",
  "Amount",
  "Funding Source",
  "Funded By",
];
export const PARTY_INCOME_DAILY_HEADERS = ["Date", "Party Name", "Amount"];
export const PARTY_INCOME_MONTHLY_BILL_HEADERS = ["Period Month", "Party Name", "Amount"];
export const COUNTER_INCOME_HEADERS = ["Date", "Amount", "Note"];
export const CAPITAL_CONTRIBUTIONS_HEADERS = ["Date", "Partner Name", "Type", "Amount"];
