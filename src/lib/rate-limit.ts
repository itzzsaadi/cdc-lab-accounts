/**
 * Phase 8A — per-user request throttling for the two expensive, authenticated
 * endpoints (historical import preview, offline sync upload).
 *
 * **Single-instance only, by design.** State lives in this process's memory,
 * so two app instances would each allow the full quota. That is an accepted,
 * documented limitation rather than an oversight: CON-02 sizes this system
 * for one small instance serving one laboratory, and a shared store (Redis)
 * would add a service, a dependency, and an operational surface for a
 * threat model that does not exist here. If this system is ever scaled
 * horizontally, this module is the thing that must be replaced first — see
 * `docs/security-review.md`.
 *
 * This is deliberately *not* the FR-AUTH-07 account lockout (10 failed
 * sign-ins, `src/lib/auth/lockout.ts`, database-backed and therefore
 * multi-instance-safe), nor Better Auth's own IP-based throttle on the auth
 * routes. Those cover credential guessing; this covers a signed-in user —
 * or stolen session — hammering an endpoint that does real work.
 *
 * Keyed by **user id, not IP**: every caller here is already authenticated,
 * a shared office NAT would otherwise make one Operator's activity throttle
 * everyone else's, and an IP key is trivially widened by an attacker who
 * already holds a session.
 */

interface Window {
  /** Requests counted so far in the current window. */
  count: number;
  /** Epoch ms at which the current window ends and `count` resets. */
  resetAt: number;
}

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry — suitable for a `Retry-After` header. */
  retryAfterSeconds: number;
}

/**
 * Hard ceiling on tracked keys. Reached only under a deliberate attempt to
 * exhaust memory with many distinct user ids (which itself requires many
 * valid sessions). When full, the oldest-expiring entry is evicted — the
 * effect is that one key loses its accumulated count early, never that the
 * process grows without bound.
 */
const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, Window>();

/** Bounded cleanup: removes expired entries. Called on every check, and the work is proportional to the map, which `MAX_TRACKED_KEYS` caps. */
function sweepExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}

function evictOldest(): void {
  let oldestKey: string | undefined;
  let oldestResetAt = Number.POSITIVE_INFINITY;
  for (const [key, window] of windows) {
    if (window.resetAt < oldestResetAt) {
      oldestResetAt = window.resetAt;
      oldestKey = key;
    }
  }
  if (oldestKey !== undefined) {
    windows.delete(oldestKey);
  }
}

/**
 * Fixed-window counter. Chosen over a sliding window or token bucket for
 * exactly the reason CON-07 asks for: it is small enough to read in one
 * sitting and has no background timer to leak. Its known weakness — up to
 * `2 × limit` requests across a window boundary — is irrelevant at these
 * limits, where the point is to stop a runaway loop, not to meter precisely.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      evictOldest();
    }
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test-only reset so one spec's exhausted window cannot leak into the next. */
export function resetRateLimitsForTesting(): void {
  windows.clear();
}

/**
 * Import preview reads, hashes, and fully parses a workbook of up to 5 MB
 * and 5,000 rows per sheet — by far the most expensive authenticated
 * request in the system. Ten per minute is far above any real Admin's pace
 * (a human previews, reads the issues, fixes the file) and far below what
 * would tie up the single instance.
 */
export const IMPORT_PREVIEW_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: 60_000 };

/**
 * Sync upload is already capped at 50 operations per batch, so 60 batches a
 * minute is 3,000 operations — comfortably above NFR-PERF-07's "200 offline
 * entries upload within 30 seconds" target, which needs only 4 batches, while
 * still bounding a client stuck in a retry loop.
 */
export const SYNC_UPLOAD_RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60_000 };
