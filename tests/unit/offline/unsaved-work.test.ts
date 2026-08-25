import { describe, expect, it } from "vitest";
import { shouldWarnBeforeUnload } from "../../../src/lib/offline/unsaved-work";

describe("shouldWarnBeforeUnload", () => {
  it("does not warn for an empty queue", () => {
    expect(shouldWarnBeforeUnload({ pendingCount: 0, conflictCount: 0, failedCount: 0 })).toBe(
      false,
    );
  });

  it("does not warn when every operation has already synced (SYNCED is never counted here)", () => {
    // SYNCED operations never contribute to any of these three counts —
    // this exercises the same all-zero shape a fully-synced queue produces.
    expect(shouldWarnBeforeUnload({ pendingCount: 0, conflictCount: 0, failedCount: 0 })).toBe(
      false,
    );
  });

  it("warns when a real operation is still pending (QUEUED/SYNCING)", () => {
    expect(shouldWarnBeforeUnload({ pendingCount: 1, conflictCount: 0, failedCount: 0 })).toBe(
      true,
    );
  });

  it("warns when an operation failed", () => {
    expect(shouldWarnBeforeUnload({ pendingCount: 0, conflictCount: 0, failedCount: 1 })).toBe(
      true,
    );
  });

  it("warns when an operation is in conflict", () => {
    expect(shouldWarnBeforeUnload({ pendingCount: 0, conflictCount: 1, failedCount: 0 })).toBe(
      true,
    );
  });

  it("warns when multiple categories are non-zero at once", () => {
    expect(shouldWarnBeforeUnload({ pendingCount: 2, conflictCount: 1, failedCount: 3 })).toBe(
      true,
    );
  });
});
