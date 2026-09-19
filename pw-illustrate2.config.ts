import { defineConfig, devices } from "@playwright/test";

/**
 * Runner for e2e/illustrate2.spec.ts — supplementary doc-illustration capture
 * (excluded from the default config via testIgnore). Run explicitly:
 *   npx playwright test --config=pw-illustrate2.config.ts --project=chromium
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /illustrate2\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
