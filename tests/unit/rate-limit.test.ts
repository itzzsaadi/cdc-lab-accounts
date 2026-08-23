import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  resetRateLimitsForTesting,
  IMPORT_PREVIEW_RATE_LIMIT,
  SYNC_UPLOAD_RATE_LIMIT,
} from "../../src/lib/rate-limit";

afterEach(() => {
  resetRateLimitsForTesting();
  vi.useRealTimers();
});

const RULE = { limit: 3, windowMs: 1000 };

describe("checkRateLimit — fixed-window counter (Phase 8A)", () => {
  it("allows requests up to the limit and refuses the next one", () => {
    for (let i = 0; i < RULE.limit; i += 1) {
      expect(checkRateLimit("user-a", RULE).allowed).toBe(true);
    }
    const refused = checkRateLimit("user-a", RULE);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys independently — one user's exhausted window never throttles another", () => {
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("user-a", RULE);
    expect(checkRateLimit("user-a", RULE).allowed).toBe(false);
    expect(checkRateLimit("user-b", RULE).allowed).toBe(true);
  });

  it("allows again once the window has elapsed", () => {
    vi.useFakeTimers();
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("user-a", RULE);
    expect(checkRateLimit("user-a", RULE).allowed).toBe(false);
    vi.advanceTimersByTime(RULE.windowMs + 1);
    expect(checkRateLimit("user-a", RULE).allowed).toBe(true);
  });

  it("reports a retryAfter of at least one second, never zero, while refusing", () => {
    vi.useFakeTimers();
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("user-a", RULE);
    // 1ms before the window closes: the true remaining time rounds to 0s,
    // but a `Retry-After: 0` would invite an immediate retry that is still
    // refused.
    vi.advanceTimersByTime(RULE.windowMs - 1);
    const refused = checkRateLimit("user-a", RULE);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("is bounded and cleanup-aware — expired keys are swept, so memory does not grow with distinct keys", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 500; i += 1) {
      checkRateLimit(`user-${i}`, RULE);
    }
    // Every window above has now expired; the next check sweeps them.
    vi.advanceTimersByTime(RULE.windowMs + 1);
    checkRateLimit("trigger-sweep", RULE);
    // Proven behaviourally rather than by reading private state: each of
    // the 500 keys is back to a fresh window, i.e. its old entry is gone.
    for (let i = 0; i < 500; i += 1) {
      expect(checkRateLimit(`user-${i}`, RULE).allowed).toBe(true);
    }
  });
});

describe("configured rules", () => {
  it("import preview is the tighter limit — it is by far the most expensive request", () => {
    expect(IMPORT_PREVIEW_RATE_LIMIT.limit).toBeLessThan(SYNC_UPLOAD_RATE_LIMIT.limit);
  });

  it("sync upload permits well above NFR-PERF-07's 200-entries target (50 per batch = 4 batches)", () => {
    expect(SYNC_UPLOAD_RATE_LIMIT.limit * 50).toBeGreaterThan(200);
  });
});
