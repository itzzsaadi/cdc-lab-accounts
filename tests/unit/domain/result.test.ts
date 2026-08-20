import { describe, expect, it } from "vitest";
import { Decimal } from "../../../src/lib/domain/money";
import {
  totalCounterIncome,
  totalPartyIncome,
  totalIncome,
  totalExpenses,
  netResult,
} from "../../../src/lib/domain/result";

describe("result aggregation (BR-01/02/03/04, FR-RES-04/05/07)", () => {
  it("sums counter income", () => {
    const entries = [{ amount: new Decimal("100.50") }, { amount: new Decimal("50.25") }];
    expect(totalCounterIncome(entries).toString()).toBe("150.75");
  });

  it("sums party income (daily, monthly, and cash-receipt rows together)", () => {
    const entries = [
      { amount: new Decimal("1000") },
      { amount: new Decimal("2500.75") },
      { amount: new Decimal("300") },
    ];
    expect(totalPartyIncome(entries).toString()).toBe("3800.75");
  });

  it("total income is counter income plus party income", () => {
    const counter = [{ amount: new Decimal("100") }];
    const party = [{ amount: new Decimal("900") }];
    expect(totalIncome(counter, party).toString()).toBe("1000");
  });

  it("excludes PARTNER-funded expenses from the profit-affecting total (BR-05/06)", () => {
    const daily = [
      { amount: new Decimal("1000"), fundingSource: "BUSINESS" as const },
      { amount: new Decimal("500"), fundingSource: "PARTNER" as const },
    ];
    const monthly = [
      { amount: new Decimal("2000"), fundingSource: "BUSINESS" as const },
      { amount: new Decimal("300"), fundingSource: "PARTNER" as const },
    ];
    // Only the BUSINESS-funded rows (1000 + 2000) should count.
    expect(totalExpenses(daily, monthly).toString()).toBe("3000");
  });

  it("includes an instalment monthly-expense row as an ordinary expense (BR-04)", () => {
    // An instalment line is just a monthly_expenses row with asset_id set;
    // the domain layer has no special case for it — it counts exactly
    // like any other BUSINESS-funded monthly expense.
    const monthly = [{ amount: new Decimal("50000"), fundingSource: "BUSINESS" as const }];
    expect(totalExpenses([], monthly).toString()).toBe("50000");
  });

  it("net result is income minus expenses, and can be negative (a loss)", () => {
    expect(netResult(new Decimal("1000"), new Decimal("1500")).toString()).toBe("-500");
    expect(netResult(new Decimal("1000"), new Decimal("400")).toString()).toBe("600");
  });

  it("never uses floating-point arithmetic (DR-01) — exact to the paisa across many small amounts", () => {
    // 0.1 + 0.2 famously != 0.3 in IEEE-754 floating point; Decimal must
    // get this exactly right.
    const entries = Array.from({ length: 10 }, () => ({ amount: new Decimal("0.1") }));
    expect(totalCounterIncome(entries).toString()).toBe("1");
  });
});
