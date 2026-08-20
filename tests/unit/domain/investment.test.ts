import { describe, expect, it } from "vitest";
import { Decimal } from "../../../src/lib/domain/money";
import { partnerInvestmentTotal } from "../../../src/lib/domain/investment";

const PARTNER_A = "11111111-1111-1111-1111-111111111111";
const PARTNER_B = "22222222-2222-2222-2222-222222222222";

describe("partner investment aggregation (FR-INV-01/02, BR-06/08/11)", () => {
  it("sums direct capital contributions for the named partner only", () => {
    const contributions = [
      {
        partnerUserId: PARTNER_A,
        amount: new Decimal("1000"),
        contributionType: "INITIAL" as const,
      },
      {
        partnerUserId: PARTNER_B,
        amount: new Decimal("5000"),
        contributionType: "INITIAL" as const,
      },
    ];
    expect(partnerInvestmentTotal(PARTNER_A, contributions, [], []).toString()).toBe("1000");
  });

  it("a DRAWING reduces the investment total, even though amount is stored positive", () => {
    const contributions = [
      {
        partnerUserId: PARTNER_A,
        amount: new Decimal("1000"),
        contributionType: "INITIAL" as const,
      },
      {
        partnerUserId: PARTNER_A,
        amount: new Decimal("300"),
        contributionType: "DRAWING" as const,
      },
    ];
    expect(partnerInvestmentTotal(PARTNER_A, contributions, [], []).toString()).toBe("700");
  });

  it("a partner-funded expense raises that partner's investment (BR-06)", () => {
    const expenses = [
      { fundedByUserId: PARTNER_A, amount: new Decimal("500") },
      { fundedByUserId: PARTNER_B, amount: new Decimal("9999") },
      { fundedByUserId: null, amount: new Decimal("1") },
    ];
    expect(partnerInvestmentTotal(PARTNER_A, [], expenses, []).toString()).toBe("500");
  });

  it("a cash-purchased asset raises the purchasing partner's investment (BR-08)", () => {
    const assets = [
      { purchasedByUserId: PARTNER_A, purchasePrice: new Decimal("150000") },
      { purchasedByUserId: null, purchasePrice: new Decimal("50000") },
    ];
    expect(partnerInvestmentTotal(PARTNER_A, [], [], assets).toString()).toBe("150000");
  });

  it("combines all three sources exactly", () => {
    const contributions = [
      {
        partnerUserId: PARTNER_A,
        amount: new Decimal("1000"),
        contributionType: "INJECTION" as const,
      },
    ];
    const expenses = [{ fundedByUserId: PARTNER_A, amount: new Decimal("250") }];
    const assets = [{ purchasedByUserId: PARTNER_A, purchasePrice: new Decimal("100000") }];
    expect(partnerInvestmentTotal(PARTNER_A, contributions, expenses, assets).toString()).toBe(
      "101250",
    );
  });
});
