import { describe, expect, it } from "vitest";
import { Decimal } from "../../../src/lib/domain/money";
import {
  toSafeExcelNumber,
  UnsafeDecimalExportError,
} from "../../../src/lib/domain/decimal-export";

describe("toSafeExcelNumber (defensive Decimal-to-number export boundary)", () => {
  it("converts an ordinary monetary value", () => {
    expect(toSafeExcelNumber(new Decimal("208076"))).toBe(208076);
    expect(toSafeExcelNumber(new Decimal("104038.50"))).toBe(104038.5);
  });

  it("converts zero and a negative (loss) value", () => {
    expect(toSafeExcelNumber(new Decimal("0"))).toBe(0);
    expect(toSafeExcelNumber(new Decimal("-231305.00"))).toBe(-231305);
  });

  it("rejects a value with more than 2 fractional digits", () => {
    expect(() => toSafeExcelNumber(new Decimal("100.005"))).toThrow(UnsafeDecimalExportError);
  });

  it("rejects a value whose cent-scaled magnitude exceeds MAX_SAFE_INTEGER", () => {
    const tooLarge = new Decimal(Number.MAX_SAFE_INTEGER).plus(1000);
    expect(() => toSafeExcelNumber(tooLarge)).toThrow(UnsafeDecimalExportError);
  });

  it("round-trips every value in the corrected July 2026 fixture", () => {
    for (const value of ["1495535", "1287459", "208076", "104038", "171190", "225650"]) {
      expect(toSafeExcelNumber(new Decimal(value))).toBe(Number(value));
    }
  });
});
