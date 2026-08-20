/**
 * Extracted as a pure function so the production-HTTPS requirement
 * (Phase 2 plan §2/§19 decision 16) is unit-testable without needing to
 * reimport `src/server/auth.ts` under different simulated environments —
 * Vitest's module cache makes re-importing a module with different
 * `process.env` values awkward, so the actual decision logic lives here
 * and `src/server/auth.ts` just calls it at startup.
 */
export function assertProductionRequiresHttps(baseURL: string, isProduction: boolean): void {
  if (!isProduction) {
    return;
  }
  if (new URL(baseURL).protocol !== "https:") {
    throw new Error(
      `BETTER_AUTH_URL must be HTTPS in production (got "${baseURL}"). Refusing to start.`,
    );
  }
}
