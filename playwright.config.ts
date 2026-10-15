import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_ENV, E2E_PORT } from "./e2e/env";

/**
 * End-to-end tests run against a production build on :3103 with their own
 * MongoDB database (`noirly-ledger-e2e`, emptied before every run) and build
 * folder (`.next-e2e`), so they never touch your dev data or `.next`.
 *
 *   pnpm test:e2e
 *
 * Needs MongoDB on 127.0.0.1:27017 (or set E2E_MONGODB_URI). Identity and
 * noirly-realtime are not needed: tests sign in with sessions minted from a
 * test-only AUTH_SECRET (see e2e/fixtures.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // One worker: every test shares one IP against the API's rate limit.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    // Optional installed browser (e.g. "chrome") instead of Playwright's download.
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    timeout: 10 * 60 * 1000,
    reuseExistingServer: !process.env.CI,
    env: E2E_ENV,
  },
});
