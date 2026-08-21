/**
 * Defensive redaction layer for the Audit Log / Change History screens
 * (FR-AUD-04/05). Applied at render time to every `oldValues`/`newValues`
 * payload, independent of whether the code that originally wrote the
 * audit row was itself secret-safe — every Phase 2–4 write path already
 * is, but this function does not rely on that being true forever. A key
 * is redacted if its name, case-insensitively, *contains* any of the
 * listed substrings — this catches `password`, `Password`, `PASSWORD`,
 * `password_hash`, `resetToken`, `sessionId`, etc. Recurses into nested
 * objects and arrays; every other field passes through unchanged.
 */
const SENSITIVE_KEY_SUBSTRINGS = [
  "password",
  "token",
  "secret",
  "cookie",
  "authorization",
  "session",
  "credential",
  "hash",
];

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((substring) => lower.includes(substring));
}

export function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveValues);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redactSensitiveValues(entry);
    }
    return result;
  }
  return value;
}
