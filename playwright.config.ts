import { existsSync } from "fs";
import { defineConfig, devices } from "@playwright/test";

// This sandbox pre-installs Chromium at a fixed path and skips Playwright's
// own browser download (see PLAYWRIGHT_BROWSERS_PATH/PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
// in the environment). Point at it only when it's actually present; real CI
// and any other machine install their own browser via `playwright install`
// and get an entirely unmodified `use` block — no `launchOptions` key at all —
// so Playwright's normal browser resolution is never touched there.
const sandboxChromium = "/opt/pw-browsers/chromium";
const sandboxOverride = existsSync(sandboxChromium)
  ? { launchOptions: { executablePath: sandboxChromium } }
  : {};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...sandboxOverride },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
