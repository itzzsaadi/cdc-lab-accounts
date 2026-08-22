/**
 * SHA-256 over deterministic canonical JSON (CLAUDE.md Phase 6 mandatory
 * decision #1). Used both client-side, when a queued operation is first
 * created (so the fingerprint travels with it and never changes across
 * retries), and server-side, when a batch arrives at `/api/sync/upload` —
 * to decide whether a repeated `operationId` is a genuine retry (identical
 * fingerprint, safe to replay the stored result) or a reused id carrying
 * different content (`OPERATION_ID_REUSED`, rejected).
 *
 * Isomorphic: uses only `globalThis.crypto.subtle`, available in every
 * modern browser and in Node (global Web Crypto, no `node:crypto` import),
 * so this module runs unchanged in the browser queue and in server route
 * handlers.
 */

/** Deterministic JSON serialization: object keys sorted, `undefined` object
 * properties dropped and array elements coerced to `null` — matching
 * `JSON.stringify`'s own behavior — so the same logical value always
 * produces the same string regardless of key insertion order. */
export function canonicalizeForFingerprint(value: unknown): string {
  if (value === undefined) {
    throw new Error("Cannot canonicalize `undefined` at the top level.");
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined ? "null" : canonicalizeForFingerprint(item),
    );
    return `[${items.join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeForFingerprint(record[key])}`,
  );
  return `{${entries.join(",")}}`;
}

/** The exact envelope every sync operation is fingerprinted over.
 * `operationId` is deliberately excluded — it is the lookup key the server
 * matches against, not part of what identifies the operation's *content*. */
export interface SyncOperationFingerprintInput {
  entityType: string;
  action: "CREATE" | "UPDATE" | "ARCHIVE";
  clientUuid: string;
  payload: Record<string, unknown>;
}

/** Lowercase hex-encoded SHA-256 digest (64 characters), matching
 * `sync_operations.request_fingerprint`'s `VARCHAR(64)` column. */
export async function computeRequestFingerprint(
  input: SyncOperationFingerprintInput,
): Promise<string> {
  const canonical = canonicalizeForFingerprint(input);
  const encoded = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
