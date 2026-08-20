import { defineConfig } from "vitest/config";
import "dotenv/config";
import { config as loadEnv } from "dotenv";

// Populate TEST_DATABASE_URL for integration/constraint tests, without
// ever letting it fall back to DATABASE_URL — see
// tests/integration/helpers/test-db.ts, which hard-fails if this is unset.
loadEnv({ path: ".env.test" });

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Integration/constraint tests share one real Postgres instance and
    // truncate between tests (Phase 1 plan §18) — run them serially so
    // truncation ordering stays deterministic.
    fileParallelism: false,
  },
});
