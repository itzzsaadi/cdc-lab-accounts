import { describe, expect, it } from "vitest";
import { decimalAmountSchema } from "../../../src/lib/validation/money";

describe("decimalAmountSchema (never z.coerce.number(), regex-only)", () => {
  const strictlyPositive = decimalAmountSchema({ allowZero: false });
  const nonNegative = decimalAmountSchema({ allowZero: true });

  it("accepts a plain integer and a two-decimal amount", () => {
    expect(strictlyPositive.safeParse("500").success).toBe(true);
    expect(strictlyPositive.safeParse("1250.50").success).toBe(true);
  });

  it("rejects zero when allowZero is false", () => {
    expect(strictlyPositive.safeParse("0").success).toBe(false);
    expect(strictlyPositive.safeParse("0.00").success).toBe(false);
    expect(strictlyPositive.safeParse("00.0").success).toBe(false);
  });

  it("accepts zero when allowZero is true", () => {
    expect(nonNegative.safeParse("0").success).toBe(true);
    expect(nonNegative.safeParse("0.00").success).toBe(true);
  });

  it.each(["-5", "-0.01", "1,000", "1.234", "abc", "", "1e5", "12345678901234"])(
    "rejects malformed or out-of-precision input: %s",
    (input) => {
      expect(strictlyPositive.safeParse(input).success).toBe(false);
    },
  );

  it("accepts up to 12 integer digits (NUMERIC(14,2))", () => {
    expect(strictlyPositive.safeParse("999999999999").success).toBe(true);
    expect(strictlyPositive.safeParse("999999999999.99").success).toBe(true);
  });

  it("rejects more than 12 integer digits", () => {
    expect(strictlyPositive.safeParse("1000000000000").success).toBe(false);
  });
});
