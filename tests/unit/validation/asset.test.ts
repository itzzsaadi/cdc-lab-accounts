import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAssetSchema } from "../../../src/lib/validation/asset";

const baseFields = { name: "Haematology Analyser", classification: "FIXED" as const };

describe("createAssetSchema (FR-AST-02/06/07, DR-08, approved decision 2b)", () => {
  it("accepts a valid INSTALMENT asset (monthlyInstalment + defaultCategoryId, no cash fields)", () => {
    const result = createAssetSchema.safeParse({
      ...baseFields,
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
      defaultCategoryId: randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects INSTALMENT with no defaultCategoryId (FR-AST-04 needs a category to generate a line from)", () => {
    const result = createAssetSchema.safeParse({
      ...baseFields,
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects INSTALMENT with a zero monthlyInstalment", () => {
    const result = createAssetSchema.safeParse({
      ...baseFields,
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "0",
      defaultCategoryId: randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects INSTALMENT with purchasePrice also set", () => {
    const result = createAssetSchema.safeParse({
      ...baseFields,
      acquisitionMode: "INSTALMENT",
      monthlyInstalment: "50000",
      defaultCategoryId: randomUUID(),
      purchasePrice: "1000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid CASH asset with a purchasing partner (approved decision 2b — never optional)", () => {
    const result = createAssetSchema.safeParse({
      ...baseFields,
      acquisitionMode: "CASH",
      purchasePrice: "150000",
      purchasedByUserId: randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects CASH with no purchasedByUserId", () => {
    const result = createAssetSchema.safeParse({
      ...baseFields,
      acquisitionMode: "CASH",
      purchasePrice: "150000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects CASH with monthlyInstalment or defaultCategoryId also set", () => {
    const result = createAssetSchema.safeParse({
      ...baseFields,
      acquisitionMode: "CASH",
      purchasePrice: "150000",
      purchasedByUserId: randomUUID(),
      defaultCategoryId: randomUUID(),
    });
    expect(result.success).toBe(false);
  });
});
