import { describe, expect, it } from "vitest";
import {
  isFormulaCellValue,
  extractImportCellText,
  extractOptionalImportCellText,
  UnsafeImportCellError,
} from "../../../src/lib/domain/import-cells";

describe("isFormulaCellValue (Phase 7 import security — formulas are never permitted)", () => {
  it("detects exceljs's formula-cell shape", () => {
    expect(isFormulaCellValue({ formula: "=SUM(A1:A2)", result: 5 })).toBe(true);
  });

  it("does not flag a plain string", () => {
    expect(isFormulaCellValue("2026-07-15")).toBe(false);
  });

  it("does not flag null/undefined/number", () => {
    expect(isFormulaCellValue(null)).toBe(false);
    expect(isFormulaCellValue(undefined)).toBe(false);
    expect(isFormulaCellValue(500)).toBe(false);
  });
});

describe("extractImportCellText", () => {
  it("returns trimmed text for a plain string cell", () => {
    expect(extractImportCellText("  500.00  ", "Amount")).toBe("500.00");
  });

  it("throws UnsafeImportCellError for a formula cell", () => {
    expect(() => extractImportCellText({ formula: "=A1", result: 1 }, "Amount")).toThrow(
      UnsafeImportCellError,
    );
  });

  it("throws for a numeric cell (Excel numeric date/amount not permitted)", () => {
    expect(() => extractImportCellText(500, "Amount")).toThrow(UnsafeImportCellError);
  });

  it("throws for a Date object cell", () => {
    expect(() => extractImportCellText(new Date(), "Date")).toThrow(UnsafeImportCellError);
  });

  it("throws for a null cell", () => {
    expect(() => extractImportCellText(null, "Amount")).toThrow(UnsafeImportCellError);
  });

  it("includes the column label in the error message", () => {
    expect(() => extractImportCellText(500, "Amount")).toThrow(/Amount/);
  });
});

describe("extractOptionalImportCellText", () => {
  it("returns undefined for null, undefined, or empty string", () => {
    expect(extractOptionalImportCellText(null, "Note")).toBeUndefined();
    expect(extractOptionalImportCellText(undefined, "Note")).toBeUndefined();
    expect(extractOptionalImportCellText("", "Note")).toBeUndefined();
  });

  it("returns trimmed text for a present value", () => {
    expect(extractOptionalImportCellText("  a note  ", "Note")).toBe("a note");
  });

  it("returns undefined for a blank-after-trim value", () => {
    expect(extractOptionalImportCellText("   ", "Note")).toBeUndefined();
  });

  it("still rejects a formula even though the column is optional", () => {
    expect(() => extractOptionalImportCellText({ formula: "=A1", result: 1 }, "Note")).toThrow(
      UnsafeImportCellError,
    );
  });
});
