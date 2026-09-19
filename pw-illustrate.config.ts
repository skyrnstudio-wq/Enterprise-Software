import { defineConfig, devices } from "@playwright/test";

/**
 * Runner for e2e/illustrate.spec.ts — the one-off doc-illustration capture
 * (excluded from the default config via testIgnore). Run explicitly:
 *   npx playwright test --config=pw-illustrate.config.ts --project=chromium
 * Requires the dev server on :5173 and E2E_* credentials in the environment.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /illustrate\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
