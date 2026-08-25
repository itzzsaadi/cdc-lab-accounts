import { describe, expect, it } from "vitest";
import { mergeFilterParams, isValidDateRange } from "../../../src/lib/navigation/filter-query";

describe("mergeFilterParams", () => {
  it("adds a new filter value", () => {
    const result = mergeFilterParams({}, { fundingSource: "BUSINESS" });
    expect(result.get("fundingSource")).toBe("BUSINESS");
  });

  it("preserves an existing, unrelated param", () => {
    const result = mergeFilterParams({ entityType: "asset" }, { actorUserId: "u1" });
    expect(result.get("entityType")).toBe("asset");
    expect(result.get("actorUserId")).toBe("u1");
  });

  it("clears a param when the update value is empty", () => {
    const result = mergeFilterParams({ search: "spray" }, { search: "" });
    expect(result.has("search")).toBe(false);
  });

  it("drops cursor by default when a filter changes", () => {
    const result = mergeFilterParams({ cursor: "abc" }, { entityType: "asset" });
    expect(result.has("cursor")).toBe(false);
  });

  it("keeps cursor when explicitly asked to", () => {
    const result = mergeFilterParams({ cursor: "abc" }, {}, { keepCursor: true });
    expect(result.get("cursor")).toBe("abc");
  });

  it("overwrites an existing value with the new one", () => {
    const result = mergeFilterParams({ from: "2026-08-01" }, { from: "2026-08-15" });
    expect(result.get("from")).toBe("2026-08-15");
  });
});

describe("isValidDateRange", () => {
  it("treats an open-ended range (either side empty) as valid", () => {
    expect(isValidDateRange(undefined, "2026-08-31")).toBe(true);
    expect(isValidDateRange("2026-08-01", undefined)).toBe(true);
    expect(isValidDateRange(undefined, undefined)).toBe(true);
  });

  it("accepts from before or equal to to", () => {
    expect(isValidDateRange("2026-08-01", "2026-08-31")).toBe(true);
    expect(isValidDateRange("2026-08-15", "2026-08-15")).toBe(true);
  });

  it("rejects from after to", () => {
    expect(isValidDateRange("2026-08-31", "2026-08-01")).toBe(false);
  });
});
