/**
 * Browser-generated create-idempotency key (D4 revision — online
 * idempotency without the offline queue). Generated once per new entry,
 * before the first submit attempt, and reused across every retry of that
 * same entry — this is what lets a dropped connection retry safely
 * without ever creating a duplicate row (see
 * `src/server/mutations/*.ts`'s `client_uuid` unique-constraint handling).
 * Never regenerate this for a retry of the *same* entry.
 */
export function generateClientUuid(): string {
  return crypto.randomUUID();
}
