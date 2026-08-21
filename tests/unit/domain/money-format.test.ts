import { describe, expect, it } from "vitest";
import { Decimal } from "../../../src/lib/domain/money";
import { formatMoney } from "../../../src/lib/domain/money-format";

describe("formatMoney (Decimal-safe display formatter)", () => {
  it("formats zero", () => {
    expect(formatMoney(new Decimal(0))).toBe("Rs 0.00");
    expect(formatMoney("0")).toBe("Rs 0.00");
  });

  it("always shows two decimal places", () => {
    expect(formatMoney("500")).toBe("Rs 500.00");
    expect(formatMoney("500.5")).toBe("Rs 500.50");
    expect(formatMoney(new Decimal("500.5"))).toBe("Rs 500.50");
  });

  it("inserts thousands separators for large values", () => {
    expect(formatMoney("1234567.89")).toBe("Rs 1,234,567.89");
    expect(formatMoney("999999999999.99")).toBe("Rs 999,999,999,999.99");
    expect(formatMoney("1000")).toBe("Rs 1,000.00");
  });

  it("does not insert a separator below 1000", () => {
    expect(formatMoney("999.99")).toBe("Rs 999.99");
  });

  it("formats negative values with a leading minus after Rs", () => {
    expect(formatMoney(new Decimal("-1234.5"))).toBe("Rs -1,234.50");
    expect(formatMoney("-0.01")).toBe("Rs -0.01");
  });

  it("never renders negative zero", () => {
    expect(formatMoney(new Decimal("-0"))).toBe("Rs 0.00");
  });

  it("accepts a Decimal instance directly", () => {
    expect(formatMoney(new Decimal(12000))).toBe("Rs 12,000.00");
  });
});
