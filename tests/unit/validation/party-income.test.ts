import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createDailyPartyIncomeCellSchema,
  createCashReceiptSchema,
  createMonthlyPartyBillSchema,
} from "../../../src/lib/validation/party-income";

describe("createDailyPartyIncomeCellSchema (FR-PINC-02/07)", () => {
  const base = {
    clientUuid: randomUUID(),
    partyId: randomUUID(),
    incomeDate: "2026-08-21",
  };

  it("accepts a valid positive amount", () => {
    expect(createDailyPartyIncomeCellSchema.safeParse({ ...base, amount: "1000" }).success).toBe(
      true,
    );
  });

  it("rejects a zero amount — party_income has no stored-zero representation", () => {
    expect(createDailyPartyIncomeCellSchema.safeParse({ ...base, amount: "0" }).success).toBe(
      false,
    );
  });

  it("rejects a negative amount", () => {
    expect(createDailyPartyIncomeCellSchema.safeParse({ ...base, amount: "-1" }).success).toBe(
      false,
    );
  });
});

describe("createCashReceiptSchema (FR-PINC-06)", () => {
  const base = {
    clientUuid: randomUUID(),
    partyId: randomUUID(),
    incomeDate: "2026-08-21",
    amount: "5000",
  };

  it("accepts a valid cash receipt with a note", () => {
    expect(createCashReceiptSchema.safeParse({ ...base, note: "Paid at reception" }).success).toBe(
      true,
    );
  });

  it("requires a non-empty note", () => {
    expect(createCashReceiptSchema.safeParse({ ...base, note: "" }).success).toBe(false);
    expect(createCashReceiptSchema.safeParse(base).success).toBe(false);
  });
});

describe("createMonthlyPartyBillSchema (FR-PINC-03, Partner-only)", () => {
  const base = {
    clientUuid: randomUUID(),
    partyId: randomUUID(),
    periodMonth: "2026-08",
    amount: "50000",
  };

  it("accepts a valid monthly bill", () => {
    expect(createMonthlyPartyBillSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a zero amount", () => {
    expect(createMonthlyPartyBillSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
  });

  it("rejects a malformed period month", () => {
    expect(createMonthlyPartyBillSchema.safeParse({ ...base, periodMonth: "2026-8" }).success).toBe(
      false,
    );
  });
});
