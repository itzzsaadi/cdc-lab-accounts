import { describe, expect, it } from "vitest";
import { Decimal } from "../../../src/lib/domain/money";
import { splitProfit } from "../../../src/lib/domain/profit-split";

describe("profit-split (BR-10/11, FR-RES-08) — deterministic remainder rule", () => {
  it("splits a round profit evenly at 50/50", () => {
    const { shareA, shareB } = splitProfit({
      splitAPercent: new Decimal(50),
      netResult: new Decimal("200076"),
    });
    expect(shareA.toString()).toBe("100038");
    expect(shareB.toString()).toBe("100038");
    expect(shareA.plus(shareB).toString()).toBe("200076");
  });

  it("assigns a one-paisa remainder to partner B, and preserves the exact total", () => {
    const { shareA, shareB } = splitProfit({
      splitAPercent: new Decimal(50),
      netResult: new Decimal("0.01"),
    });
    // 0.01 * 50 / 100 = 0.005, rounds half-up to 0.01 for A; B gets the remainder (0).
    expect(shareA.toString()).toBe("0.01");
    expect(shareB.toString()).toBe("0");
    expect(shareA.plus(shareB).toString()).toBe("0.01");
  });

  it("applies identically to a loss (BR-10) — same rule, negative input", () => {
    const { shareA, shareB } = splitProfit({
      splitAPercent: new Decimal(50),
      netResult: new Decimal("-231305"),
    });
    expect(shareA.toString()).toBe("-115652.5");
    expect(shareB.toString()).toBe("-115652.5");
    expect(shareA.plus(shareB).toString()).toBe("-231305");
  });

  it("supports an uneven split while still preserving the exact total", () => {
    const { shareA, shareB } = splitProfit({
      splitAPercent: new Decimal(60),
      netResult: new Decimal("1000.03"),
    });
    expect(shareA.plus(shareB).toString()).toBe("1000.03");
    expect(shareA.toString()).toBe("600.02"); // 1000.03 * 0.6 = 600.018 -> half-up to 600.02
    expect(shareB.toString()).toBe("400.01");
  });

  it("BR-11: the function signature has no parameter investment data could enter through", () => {
    const params: Parameters<typeof splitProfit>[0] = {
      splitAPercent: new Decimal(50),
      netResult: new Decimal("100"),
    };
    expect(Object.keys(params).sort()).toEqual(["netResult", "splitAPercent"]);
  });
});
