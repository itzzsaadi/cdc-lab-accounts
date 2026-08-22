/**
 * Retry/backoff policy (approved Phase 6 decision): up to 5 automatic
 * attempts, exponential backoff with jitter, base 2 seconds, capped at 30
 * seconds. `attempt` is the attempt number that just failed (1-indexed —
 * the first failure is attempt 1); the returned delay is how long to wait
 * before the *next* attempt.
 */
export const MAX_AUTOMATIC_ATTEMPTS = 5;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

/** Pure and deterministic given a `random` override (tests pass a fixed
 * value; production uses `Math.random`) so the jitter bounds are directly
 * testable without flakiness. */
export function computeBackoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  // Full jitter: a uniformly random delay between 0 and the capped value,
  // so many devices reconnecting at once don't retry in lockstep.
  return Math.round(capped * random());
}
