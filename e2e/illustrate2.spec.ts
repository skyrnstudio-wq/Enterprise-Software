/**
 * Illustration capture — supplementary features: NCR drafting with the
 * register, the multi-tab conflict guard, and the offline queue drain.
 * Companion to illustrate.spec.ts; same runner:
 *   npx playwright test --config=pw-illustrate2.config.ts --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

const OUT = "docs/assets/guide";
fs.mkdirSync(OUT, { recursive: true });

const INSPECTOR = { email: "inspector1@simran.local", password: "Simran#2026" };

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(INSPECTOR.email);
  await page.getByLabel("Password").fill(INSPECTOR.password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Inspection batches" })).toBeVisible({
    timeout: 20_000,
  });
}

test("NCR — fail a row, draft the NCR, show the register", async ({ page }) => {
  await signIn(page);
  // Fresh draft lot
  await page.getByRole("button", { name: "New dimensional", exact: true }).click();
  await page.getByRole("button", { name: /·/ }).first().click();
  await page.getByLabel("PO number").fill(`PO-ILL-NCR-${String(Date.now()).slice(-6)}`);
  await page.getByLabel("Delivery batch").fill("2609-03");
  await page.getByLabel("Lot quantity").fill("40");
  await page.getByRole("button", { name: /Load Inspection Grid/ }).click();
  await expect(page.getByTestId("grid-scroll")).toBeVisible();

  // Fill the grid completely (Fill Nominal → Copy 01→05), then put all five
  // samples of row 9 beyond the upper limit — a row status only becomes
  // fail once every sample is entered (incomplete rows gate but don't flag).
  await page.getByRole("button", { name: "Fill Nominal" }).click();
  await page.getByRole("button", { name: "Copy 01→05" }).click();
  for (const sample of ["01", "02", "03", "04", "05"]) {
    await page.getByLabel(`Row 9 sample ${sample}`).fill("101.20");
  }
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Draft NCR/ }).click();
  await expect(page.getByText("Draft non-conformance report")).toBeVisible();

  // Preset the finding the way the app does from a fail
  const finding = "Row 9 bore measured 101.20 — beyond the 100.75 upper limit on 1 of 5 samples.";
  await page.locator("textarea").fill(finding);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/07-ncr-dialog.png` });

  await page.getByRole("button", { name: /Open NCR|Create|Draft/ }).last().click();
  await page.waitForTimeout(1000);

  // The register
  await page.goto("/ncr");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/07-ncr-register.png`, fullPage: true });
});

test("multi-tab — second tab goes read-only", async ({ page, context }) => {
  await signIn(page);
  // Open a draft in tab 1
  await page.getByRole("button", { name: "New dimensional", exact: true }).click();
  await page.getByRole("button", { name: /·/ }).first().click();
  await page.getByLabel("PO number").fill(`PO-ILL-TAB-${String(Date.now()).slice(-6)}`);
  await page.getByLabel("Delivery batch").fill("2609-04");
  await page.getByLabel("Lot quantity").fill("20");
  await page.getByRole("button", { name: /Load Inspection Grid/ }).click();
  await expect(page.getByTestId("grid-scroll")).toBeVisible();
  await page.waitForTimeout(800);

  // Tab 2 opens the same draft via the drafts strip
  const page2 = await context.newPage();
  await signIn(page2);
  const draftRow = page2.locator("tbody tr", { hasText: "2609-04" }).first();
  await expect(draftRow).toBeVisible({ timeout: 15_000 });
  await draftRow.getByRole("link").first().click();
  await expect(page2.getByTestId("grid-scroll")).toBeVisible({ timeout: 15_000 });

  // Mechanics: every mutation AND every draft load pings the other tab, and
  // the receiver locks if it holds the same draft. Tab 2's load ping lands
  // after tab 1's, so TAB 1 is the read-only one — write in tab 2, shoot the
  // locked banner in tab 1.
  await page2.getByLabel("Row 2 sample 01").fill("100.30");
  await page
    .getByText(/open in another tab/i)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/08-multitab-guard.png`, fullPage: false });
  await page2.close();
});

test("offline — edits queue, banner shows, drain on reconnect", async ({ page, context }) => {
  await signIn(page);
  await page.getByRole("button", { name: "New dimensional", exact: true }).click();
  await page.getByRole("button", { name: /·/ }).first().click();
  await page.getByLabel("PO number").fill(`PO-ILL-OFF-${String(Date.now()).slice(-6)}`);
  await page.getByLabel("Delivery batch").fill("2609-05");
  await page.getByLabel("Lot quantity").fill("30");
  await page.getByRole("button", { name: /Load Inspection Grid/ }).click();
  await expect(page.getByTestId("grid-scroll")).toBeVisible();
  await expect(page.getByLabel("Row 2 sample 01")).toBeVisible();

  // Cut the network; type a reading; show the offline save state
  await context.setOffline(true);
  await page.getByLabel("Row 2 sample 01").fill("100.30");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/09-offline-banner.png`, fullPage: false });

  // Reconnect: the queue drains and the indicator returns to "saved"
  await context.setOffline(false);
  await page.getByText(/saved/i).first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/09-offline-drained.png`, fullPage: false });
});
