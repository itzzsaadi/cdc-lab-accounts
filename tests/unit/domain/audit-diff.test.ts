import { describe, expect, it } from "vitest";
import { diffAuditValues } from "../../../src/lib/domain/audit-diff";

describe("diffAuditValues", () => {
  it("a Created row (no oldValues) shows each field's value exactly once, never duplicated", () => {
    const diffs = diffAuditValues(null, { amount: "1456", expenseDate: "2026-08-25" });
    expect(diffs).toEqual([
      { key: "amount", before: undefined, after: "1456", changed: true },
      { key: "expenseDate", before: undefined, after: "2026-08-25", changed: true },
    ]);
  });

  it("an Updated row shows before and after exactly once each for a changed field", () => {
    const diffs = diffAuditValues({ amount: "500" }, { amount: "750" });
    expect(diffs).toEqual([{ key: "amount", before: "500", after: "750", changed: true }]);
  });

  it("an unchanged field between before/after is not marked changed and has no duplicate", () => {
    const diffs = diffAuditValues({ fundingSource: "BUSINESS" }, { fundingSource: "BUSINESS" });
    expect(diffs).toEqual([
      { key: "fundingSource", before: "BUSINESS", after: "BUSINESS", changed: false },
    ]);
  });

  it("an Archived row (no newValues) shows only the before side, never a phantom after", () => {
    const diffs = diffAuditValues({ isActive: true }, null);
    expect(diffs).toEqual([{ key: "isActive", before: true, after: undefined, changed: true }]);
  });

  it("keys are the union of both sides, sorted, with no key appearing twice", () => {
    const diffs = diffAuditValues({ b: 1, a: 1 }, { a: 2, c: 3 });
    expect(diffs.map((d) => d.key)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when both sides are empty/missing", () => {
    expect(diffAuditValues(null, null)).toEqual([]);
    expect(diffAuditValues(undefined, undefined)).toEqual([]);
  });
});
