import { describe, expect, it } from "vitest";

// Phase 0 sanity check: proves the Vitest harness (config, TypeScript,
// path-alias resolution) is wired correctly. Not tied to any application
// code — real domain-logic tests start in Phase 1.
describe("Phase 0 sanity check", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
