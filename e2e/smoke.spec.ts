import { test, expect } from "@playwright/test";

/**
 * Smoke: the app boots and the auth guard routes unauthenticated users to
 * /login (S1, ui-ux-plan §6.1). Deeper journeys live in journeys.spec.ts.
 */
test("app boots and routes to the login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in");
  // The graphite panel carries the controlled-format identity block.
  await expect(page.getByText("ST/QC/02 — Dimensional Inspection Record")).toBeVisible();
  await expect(page.getByText("ST/QC/04 — Coating Inspection Record")).toBeVisible();
});

test("the sign-up route explains the provisioned-access model", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Need access?" }).click();
  // No self-service form: the screen states the admin-provisioned model.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Accounts are provisioned",
  );
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in");
});
