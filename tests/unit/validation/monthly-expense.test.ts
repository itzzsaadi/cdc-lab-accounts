import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createMonthlyExpenseSchema,
  applyRecurringPrefillSchema,
} from "../../../src/lib/validation/monthly-expense";

const base = {
  clientUuid: randomUUID(),
  periodMonth: "2026-08",
  categoryId: randomUUID(),
  amount: "1000",
  fundingSource: "BUSINESS" as const,
};

describe("createMonthlyExpenseSchema (FR-MEXP-01/05/08)", () => {
  it("accepts a valid Business monthly expense", () => {
    expect(createMonthlyExpenseSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    expect(createMonthlyExpenseSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
  });

  it("requires fundedByUserId when fundingSource is PARTNER (DR-07 mirrored)", () => {
    expect(
      createMonthlyExpenseSchema.safeParse({ ...base, fundingSource: "PARTNER" }).success,
    ).toBe(false);
  });

  it("accepts PARTNER with fundedByUserId set", () => {
    expect(
      createMonthlyExpenseSchema.safeParse({
        ...base,
        fundingSource: "PARTNER",
        fundedByUserId: randomUUID(),
      }).success,
    ).toBe(true);
  });

  it("rejects BUSINESS with fundedByUserId set", () => {
    expect(
      createMonthlyExpenseSchema.safeParse({ ...base, fundedByUserId: randomUUID() }).success,
    ).toBe(false);
  });

  it("rejects a malformed period month", () => {
    expect(createMonthlyExpenseSchema.safeParse({ ...base, periodMonth: "2026-8" }).success).toBe(
      false,
    );
  });
});

describe("applyRecurringPrefillSchema (FR-MEXP-06)", () => {
  it("requires at least one line", () => {
    expect(
      applyRecurringPrefillSchema.safeParse({ periodMonth: "2026-08", lines: [] }).success,
    ).toBe(false);
  });

  it("accepts a valid batch", () => {
    expect(
      applyRecurringPrefillSchema.safeParse({
        periodMonth: "2026-08",
        lines: [{ categoryId: randomUUID(), amount: "500", fundingSource: "BUSINESS" }],
      }).success,
    ).toBe(true);
  });
});
