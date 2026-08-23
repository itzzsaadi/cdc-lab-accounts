import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createPartySchema,
  updatePartySchema,
  createExpenseItemSchema,
  createExpenseCategorySchema,
  createVendorSchema,
  archiveOrReactivatePartySchema,
  namesMatchNormalized,
} from "../../../src/lib/validation/master-data";

describe("createPartySchema (FR-MST-01)", () => {
  it("trims a name with surrounding whitespace", () => {
    const parsed = createPartySchema.parse({
      name: "  Test Lab A  ",
      billingMode: "DAILY",
      sortOrder: 1,
    });
    expect(parsed.name).toBe("Test Lab A");
  });

  it("rejects an empty (or whitespace-only) name", () => {
    expect(
      createPartySchema.safeParse({ name: "   ", billingMode: "DAILY", sortOrder: 1 }).success,
    ).toBe(false);
  });

  it("rejects a name over 150 characters", () => {
    expect(
      createPartySchema.safeParse({ name: "a".repeat(151), billingMode: "DAILY", sortOrder: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects an invalid billingMode", () => {
    expect(
      createPartySchema.safeParse({ name: "Test", billingMode: "WEEKLY", sortOrder: 1 }).success,
    ).toBe(false);
  });

  it("rejects a negative sortOrder", () => {
    expect(
      createPartySchema.safeParse({ name: "Test", billingMode: "DAILY", sortOrder: -1 }).success,
    ).toBe(false);
  });
});

describe("updatePartySchema — billingMode deliberately absent (immutable after creation)", () => {
  it("accepts a valid update with a null expectedUpdatedAt (first edit)", () => {
    const parsed = updatePartySchema.safeParse({
      id: randomUUID(),
      name: "Renamed Lab",
      sortOrder: 2,
      expectedUpdatedAt: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("does not accept a billingMode field at all (not part of the shape)", () => {
    expect("billingMode" in updatePartySchema.shape).toBe(false);
  });

  it("rejects a non-UUID id", () => {
    expect(
      updatePartySchema.safeParse({
        id: "not-a-uuid",
        name: "Test",
        sortOrder: 1,
        expectedUpdatedAt: null,
      }).success,
    ).toBe(false);
  });
});

describe("archiveOrReactivatePartySchema", () => {
  it("accepts a valid archive request", () => {
    expect(
      archiveOrReactivatePartySchema.safeParse({
        id: randomUUID(),
        isActive: false,
        expectedUpdatedAt: "2026-08-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a missing isActive", () => {
    expect(
      archiveOrReactivatePartySchema.safeParse({ id: randomUUID(), expectedUpdatedAt: null })
        .success,
    ).toBe(false);
  });
});

describe("createExpenseItemSchema (FR-MST-02)", () => {
  it("trims and accepts", () => {
    expect(createExpenseItemSchema.parse({ name: "  Reagent X  " }).name).toBe("Reagent X");
  });

  it("rejects over 120 characters", () => {
    expect(createExpenseItemSchema.safeParse({ name: "a".repeat(121) }).success).toBe(false);
  });
});

describe("createExpenseCategorySchema (FR-MST-03) — expenseGroup fixed at creation", () => {
  it("accepts ADMIN and PURCHASING groups", () => {
    expect(
      createExpenseCategorySchema.safeParse({
        name: "Utilities",
        expenseGroup: "ADMIN",
        isRecurring: true,
      }).success,
    ).toBe(true);
    expect(
      createExpenseCategorySchema.safeParse({
        name: "Reagents",
        expenseGroup: "PURCHASING",
        isRecurring: false,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown expenseGroup", () => {
    expect(
      createExpenseCategorySchema.safeParse({
        name: "Other",
        expenseGroup: "MISC",
        isRecurring: false,
      }).success,
    ).toBe(false);
  });
});

describe("createVendorSchema (FR-MST-04)", () => {
  it("trims and accepts", () => {
    expect(createVendorSchema.parse({ name: "  Acme Supplies  " }).name).toBe("Acme Supplies");
  });
});

describe("namesMatchNormalized (case/whitespace-insensitive, mirrors the DB functional index)", () => {
  it("matches names differing only by case", () => {
    expect(namesMatchNormalized("Test Lab A", "test lab a")).toBe(true);
  });

  it("matches names differing only by surrounding whitespace", () => {
    expect(namesMatchNormalized("Test Lab A", "  Test Lab A  ")).toBe(true);
  });

  it("does not match genuinely different names", () => {
    expect(namesMatchNormalized("Test Lab A", "Test Lab B")).toBe(false);
  });
});
