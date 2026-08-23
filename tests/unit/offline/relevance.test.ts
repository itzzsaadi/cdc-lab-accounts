import { describe, expect, it } from "vitest";
import {
  operationAffectedRange,
  operationsAffectingRange,
} from "../../../src/lib/offline/relevance";
import type { QueuedOperation } from "../../../src/lib/offline/types";

function op(overrides: Partial<QueuedOperation>): QueuedOperation {
  return {
    operationId: "op-1",
    entityType: "daily_expense",
    clientUuid: "record-1",
    action: "CREATE",
    payload: {},
    requestFingerprint: "fp",
    status: "QUEUED",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe("operationAffectedRange", () => {
  it("uses expenseDate for a daily_expense as a single-day range", () => {
    const range = operationAffectedRange(
      op({ entityType: "daily_expense", payload: { expenseDate: "2026-08-05" } }),
    );
    expect(range).toEqual({ from: "2026-08-05", to: "2026-08-05" });
  });

  it("uses incomeDate for counter_income/party_income_daily/cash_receipt", () => {
    for (const entityType of [
      "counter_income",
      "party_income_daily",
      "party_income_cash_receipt",
    ] as const) {
      const range = operationAffectedRange(
        op({ entityType, payload: { incomeDate: "2026-08-11" } }),
      );
      expect(range).toEqual({ from: "2026-08-11", to: "2026-08-11" });
    }
  });

  it("expands periodMonth (monthly_expense/monthly_bill) to the full calendar month", () => {
    for (const entityType of ["monthly_expense", "party_income_monthly_bill"] as const) {
      const range = operationAffectedRange(op({ entityType, payload: { periodMonth: "2026-08" } }));
      expect(range).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    }
  });

  it("returns null when the expected date field is missing or malformed", () => {
    expect(operationAffectedRange(op({ entityType: "daily_expense", payload: {} }))).toBeNull();
    expect(
      operationAffectedRange(op({ entityType: "daily_expense", payload: { expenseDate: 12345 } })),
    ).toBeNull();
  });
});

describe("operationsAffectingRange", () => {
  const inRange = op({
    operationId: "in-range",
    entityType: "daily_expense",
    payload: { expenseDate: "2026-08-15" },
  });
  const outOfRange = op({
    operationId: "out-of-range",
    entityType: "daily_expense",
    payload: { expenseDate: "2026-07-15" },
  });
  const monthlyOverlap = op({
    operationId: "monthly-overlap",
    entityType: "monthly_expense",
    payload: { periodMonth: "2026-08" },
  });
  const undated = op({ operationId: "undated", entityType: "daily_expense", payload: {} });

  it("keeps only operations whose affected range overlaps [from, to]", () => {
    const result = operationsAffectingRange(
      [inRange, outOfRange, monthlyOverlap, undated],
      "2026-08-01",
      "2026-08-31",
    );
    expect(result.map((r) => r.operationId).sort()).toEqual(["in-range", "monthly-overlap"]);
  });

  it("returns an empty array when nothing overlaps", () => {
    expect(operationsAffectingRange([outOfRange], "2026-08-01", "2026-08-31")).toEqual([]);
  });

  it("treats a boundary date as overlapping (inclusive range)", () => {
    const boundary = op({ entityType: "daily_expense", payload: { expenseDate: "2026-08-31" } });
    expect(operationsAffectingRange([boundary], "2026-08-01", "2026-08-31")).toHaveLength(1);
  });
});
