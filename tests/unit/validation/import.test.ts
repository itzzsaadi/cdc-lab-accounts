import { describe, expect, it } from "vitest";
import {
  importDailyExpenseRowSchema,
  importMonthlyExpenseRowSchema,
  importPartyIncomeDailyRowSchema,
  importPartyIncomeMonthlyBillRowSchema,
  importCounterIncomeRowSchema,
  importCapitalContributionRowSchema,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS_PER_SHEET,
  IMPORT_SHEET_NAMES,
} from "../../../src/lib/validation/import";

describe("historical import approved limits (FR-IMP-01/02)", () => {
  it("file size limit is 5 MB", () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(5 * 1024 * 1024);
  });

  it("row limit is 5,000 rows per sheet", () => {
    expect(MAX_IMPORT_ROWS_PER_SHEET).toBe(5000);
  });

  it("exactly six supported sheet names", () => {
    expect(IMPORT_SHEET_NAMES).toEqual([
      "Daily Expenses",
      "Monthly Expenses",
      "Party Income (Daily)",
      "Party Income (Monthly Bill)",
      "Counter Income",
      "Capital Contributions",
    ]);
  });
});

describe("importDailyExpenseRowSchema", () => {
  const valid = {
    date: "2026-07-15",
    itemName: "Reagent X",
    amount: "500.00",
    fundingSource: "BUSINESS" as const,
  };

  it("accepts a valid row", () => {
    expect(importDailyExpenseRowSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a zero amount (never allowed for daily expenses)", () => {
    expect(importDailyExpenseRowSchema.safeParse({ ...valid, amount: "0" }).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(importDailyExpenseRowSchema.safeParse({ ...valid, amount: "-5" }).success).toBe(false);
  });

  it("rejects a malformed date shape (schema only checks textual shape)", () => {
    expect(importDailyExpenseRowSchema.safeParse({ ...valid, date: "07/15/2026" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown fundingSource", () => {
    expect(
      importDailyExpenseRowSchema.safeParse({ ...valid, fundingSource: "OTHER" }).success,
    ).toBe(false);
  });

  it("accepts fundedByName as optional", () => {
    expect(importDailyExpenseRowSchema.safeParse(valid).success).toBe(true);
  });
});

describe("importMonthlyExpenseRowSchema", () => {
  it("accepts a valid row with a YYYY-MM period month", () => {
    expect(
      importMonthlyExpenseRowSchema.safeParse({
        periodMonth: "2026-07",
        categoryName: "Utilities",
        amount: "10000",
        fundingSource: "PARTNER",
        fundedByName: "Partner A",
      }).success,
    ).toBe(true);
  });

  it("rejects a full date instead of a year-month", () => {
    expect(
      importMonthlyExpenseRowSchema.safeParse({
        periodMonth: "2026-07-01",
        categoryName: "Utilities",
        amount: "10000",
        fundingSource: "BUSINESS",
      }).success,
    ).toBe(false);
  });
});

describe("importPartyIncomeDailyRowSchema / importPartyIncomeMonthlyBillRowSchema", () => {
  it("daily row requires a full date", () => {
    expect(
      importPartyIncomeDailyRowSchema.safeParse({
        date: "2026-07-15",
        partyName: "Test Party",
        amount: "1000",
      }).success,
    ).toBe(true);
  });

  it("monthly-bill row requires a year-month, not a full date", () => {
    expect(
      importPartyIncomeMonthlyBillRowSchema.safeParse({
        periodMonth: "2026-07-15",
        partyName: "Test Party",
        amount: "1000",
      }).success,
    ).toBe(false);
  });
});

describe("importCounterIncomeRowSchema — zero amount is allowed (DR: counter_income CHECK amount >= 0)", () => {
  it("accepts a zero amount", () => {
    expect(
      importCounterIncomeRowSchema.safeParse({ date: "2026-07-15", amount: "0" }).success,
    ).toBe(true);
  });

  it("rejects a negative amount", () => {
    expect(
      importCounterIncomeRowSchema.safeParse({ date: "2026-07-15", amount: "-1" }).success,
    ).toBe(false);
  });
});

describe("importCapitalContributionRowSchema", () => {
  it("accepts each valid contributionType", () => {
    for (const type of ["INITIAL", "INJECTION", "DRAWING"]) {
      expect(
        importCapitalContributionRowSchema.safeParse({
          date: "2026-07-01",
          partnerName: "Partner A",
          type,
          amount: "1000",
        }).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown contributionType", () => {
    expect(
      importCapitalContributionRowSchema.safeParse({
        date: "2026-07-01",
        partnerName: "Partner A",
        type: "REFUND",
        amount: "1000",
      }).success,
    ).toBe(false);
  });
});
