import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCounterIncomeSchema } from "../../../src/lib/validation/counter-income";

describe("createCounterIncomeSchema (FR-CINC-01/04)", () => {
  const base = {
    clientUuid: randomUUID(),
    incomeDate: "2026-08-21",
  };

  it("accepts a positive amount", () => {
    expect(createCounterIncomeSchema.safeParse({ ...base, amount: "3200" }).success).toBe(true);
  });

  it("accepts zero — counter_income is the one table with CHECK (amount >= 0)", () => {
    expect(createCounterIncomeSchema.safeParse({ ...base, amount: "0" }).success).toBe(true);
  });

  it("rejects a negative amount", () => {
    expect(createCounterIncomeSchema.safeParse({ ...base, amount: "-1" }).success).toBe(false);
  });

  it("confirmedDuplicate defaults to absent/false and is accepted when true", () => {
    expect(createCounterIncomeSchema.safeParse({ ...base, amount: "100" }).success).toBe(true);
    expect(
      createCounterIncomeSchema.safeParse({ ...base, amount: "100", confirmedDuplicate: true })
        .success,
    ).toBe(true);
  });
});
