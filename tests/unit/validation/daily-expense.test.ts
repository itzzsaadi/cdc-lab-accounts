import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDailyExpenseSchema } from "../../../src/lib/validation/daily-expense";

const base = {
  clientUuid: randomUUID(),
  expenseDate: "2026-08-21",
  amount: "500",
  fundingSource: "BUSINESS" as const,
};

describe("createDailyExpenseSchema (FR-DEXP-01/02/05/06)", () => {
  it("accepts a valid Business expense with an expenseItemId", () => {
    const result = createDailyExpenseSchema.safeParse({ ...base, expenseItemId: randomUUID() });
    expect(result.success).toBe(true);
  });

  it("accepts a valid Business expense with a customDescription instead of an item", () => {
    const result = createDailyExpenseSchema.safeParse({
      ...base,
      customDescription: "Ad hoc courier charge",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither expenseItemId nor customDescription is given", () => {
    const result = createDailyExpenseSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("rejects when both expenseItemId and customDescription are given", () => {
    const result = createDailyExpenseSchema.safeParse({
      ...base,
      expenseItemId: randomUUID(),
      customDescription: "Also this",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative amount (FR-DEXP-06)", () => {
    expect(
      createDailyExpenseSchema.safeParse({ ...base, expenseItemId: randomUUID(), amount: "0" })
        .success,
    ).toBe(false);
    expect(
      createDailyExpenseSchema.safeParse({ ...base, expenseItemId: randomUUID(), amount: "-5" })
        .success,
    ).toBe(false);
  });

  it("rejects a malformed calendar date", () => {
    const result = createDailyExpenseSchema.safeParse({
      ...base,
      expenseItemId: randomUUID(),
      expenseDate: "2026-02-30",
    });
    expect(result.success).toBe(false);
  });

  it("requires fundedByUserId when fundingSource is PARTNER", () => {
    const result = createDailyExpenseSchema.safeParse({
      ...base,
      expenseItemId: randomUUID(),
      fundingSource: "PARTNER",
    });
    expect(result.success).toBe(false);
  });

  it("accepts PARTNER with fundedByUserId set", () => {
    const result = createDailyExpenseSchema.safeParse({
      ...base,
      expenseItemId: randomUUID(),
      fundingSource: "PARTNER",
      fundedByUserId: randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects BUSINESS with fundedByUserId set (bidirectional, mirrors the DB CHECK)", () => {
    const result = createDailyExpenseSchema.safeParse({
      ...base,
      expenseItemId: randomUUID(),
      fundingSource: "BUSINESS",
      fundedByUserId: randomUUID(),
    });
    expect(result.success).toBe(false);
  });
});
