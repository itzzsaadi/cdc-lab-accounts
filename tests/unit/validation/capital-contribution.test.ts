import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCapitalContributionSchema } from "../../../src/lib/validation/capital-contribution";

const base = {
  partnerUserId: randomUUID(),
  entryDate: "2026-08-21",
  amount: "10000",
};

describe("createCapitalContributionSchema (FR-INV-03/04)", () => {
  it.each(["INITIAL", "INJECTION", "DRAWING"] as const)(
    "accepts a valid %s entry with a positive amount",
    (contributionType) => {
      expect(createCapitalContributionSchema.safeParse({ ...base, contributionType }).success).toBe(
        true,
      );
    },
  );

  it("rejects a zero amount even for DRAWING (amount is always positive; sign comes from contributionType)", () => {
    expect(
      createCapitalContributionSchema.safeParse({
        ...base,
        amount: "0",
        contributionType: "DRAWING",
      }).success,
    ).toBe(false);
  });

  it("rejects a negative amount string (there is no signed input — DRAWING alone conveys direction)", () => {
    expect(
      createCapitalContributionSchema.safeParse({
        ...base,
        amount: "-500",
        contributionType: "DRAWING",
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid contributionType", () => {
    expect(
      createCapitalContributionSchema.safeParse({ ...base, contributionType: "REFUND" }).success,
    ).toBe(false);
  });
});
