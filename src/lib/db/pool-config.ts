/**
 * Extracted as a pure function (same reasoning as
 * `src/lib/auth/production-guards.ts`) so `DATABASE_POOL_MAX` parsing is
 * unit-testable without the module-cache awkwardness of re-importing
 * `src/server/prisma.ts` under different simulated environments.
 */
export function parsePoolMax(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`DATABASE_POOL_MAX must be a positive integer (got "${raw}").`);
  }
  return value;
}
