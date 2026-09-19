import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E — technology-stack.md §3.9.
 * Journeys: inspector → QH → PDF; keyboard-only grid navigation;
 * the dew-point lock-out gate.
 * Runs against the staging Supabase project via `baseURL` + env.
 */
export default defineConfig({
  testDir: "./e2e",
  // illustrate.spec.ts is a one-off doc-illustration capture, run explicitly
  // via pw-illustrate.config.ts:
  //   npx playwright test --config=pw-illustrate.config.ts --project=chromium
  testIgnore: /illustrate[2]?\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
      },
});
