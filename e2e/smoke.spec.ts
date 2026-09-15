import { test, expect } from "@playwright/test";

// Phase 0 smoke: the shell boots. Full journeys (inspector → QH → PDF)
// arrive with their features.
test("app shell loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Inspection Automation Platform",
  );
});
