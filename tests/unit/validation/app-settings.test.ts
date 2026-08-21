import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { configurePartnerMappingSchema } from "../../../src/lib/validation/app-settings";

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
