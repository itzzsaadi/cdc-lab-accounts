import { describe, expect, it } from "vitest";
import { computeBackoffDelayMs, MAX_AUTOMATIC_ATTEMPTS } from "../../../src/lib/offline/backoff";

describe("computeBackoffDelayMs", () => {
  it("caps automatic attempts at 5", () => {
    expect(MAX_AUTOMATIC_ATTEMPTS).toBe(5);
  });

  it("stays within [0, 2000] on the first attempt", () => {
    for (const random of [0, 0.25, 0.5, 0.75, 1]) {
      const delay = computeBackoffDelayMs(1, () => random);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(2000);
    }
  });

  it("doubles the cap per attempt up to the 30s ceiling", () => {
    expect(computeBackoffDelayMs(1, () => 1)).toBe(2000);
    expect(computeBackoffDelayMs(2, () => 1)).toBe(4000);
    expect(computeBackoffDelayMs(3, () => 1)).toBe(8000);
    expect(computeBackoffDelayMs(4, () => 1)).toBe(16000);
    expect(computeBackoffDelayMs(5, () => 1)).toBe(30000); // 32000 capped to 30000
  });

  it("never exceeds 30 seconds even for a much later attempt", () => {
    expect(computeBackoffDelayMs(20, () => 1)).toBe(30000);
  });

  it("is 0 when random() returns 0 (full jitter floor)", () => {
    expect(computeBackoffDelayMs(3, () => 0)).toBe(0);
  });
});
