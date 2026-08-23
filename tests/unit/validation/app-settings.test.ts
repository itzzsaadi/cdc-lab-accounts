import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  configurePartnerMappingSchema,
  percentStringSchema,
  updateProfitSplitSchema,
} from "../../../src/lib/validation/app-settings";

describe("configurePartnerMappingSchema (Phase 5 partner mapping)", () => {
  it("accepts two distinct valid UUIDs", () => {
    expect(
      configurePartnerMappingSchema.safeParse({
        partnerAUserId: randomUUID(),
        partnerBUserId: randomUUID(),
      }).success,
    ).toBe(true);
  });

  it("rejects the same id for both partners", () => {
    const id = randomUUID();
    const result = configurePartnerMappingSchema.safeParse({
      partnerAUserId: id,
      partnerBUserId: id,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID string", () => {
    expect(
      configurePartnerMappingSchema.safeParse({
        partnerAUserId: "not-a-uuid",
        partnerBUserId: randomUUID(),
      }).success,
    ).toBe(false);
  });

  it("rejects a missing field", () => {
    expect(configurePartnerMappingSchema.safeParse({ partnerAUserId: randomUUID() }).success).toBe(
      false,
    );
  });
});

describe("percentStringSchema (Phase 7 profit-split, FR-MST-06 — matches NUMERIC(5,2))", () => {
  it.each(["50", "50.00", "0", "100", "100.00", "33.33"])("accepts %s", (input) => {
    expect(percentStringSchema.safeParse(input).success).toBe(true);
  });

  it.each(["1000", "50.123", "-5", "abc", ""])("rejects %s", (input) => {
    expect(percentStringSchema.safeParse(input).success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    expect(percentStringSchema.parse("  50  ")).toBe("50");
  });
});

describe("updateProfitSplitSchema — shape only, sum-to-100 is enforced server-side against Decimal", () => {
  it("accepts two percent strings regardless of whether they sum to 100 (shape check only)", () => {
    expect(
      updateProfitSplitSchema.safeParse({ splitAPercent: "60", splitBPercent: "60" }).success,
    ).toBe(true);
  });

  it("rejects a malformed percent string", () => {
    expect(
      updateProfitSplitSchema.safeParse({ splitAPercent: "60", splitBPercent: "abc" }).success,
    ).toBe(false);
  });
});
