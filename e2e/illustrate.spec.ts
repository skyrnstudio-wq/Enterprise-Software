/**
 * Illustration capture — walks the client guide's six-stage lot flow in the
 * live app (dev server :5173, hosted Supabase) and screenshots each stage to
 * docs/assets/guide/*.png. Verify-only helper; not part of the CI suite
 * (filename starts with _ and it is excluded by testIgnore for normal runs).
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import crypto from "node:crypto";

const OUT = "docs/assets/guide";
fs.mkdirSync(OUT, { recursive: true });

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totpCode(secret: string, offset = 0): string {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of secret.toUpperCase()) {
    const idx = ALPHA.indexOf(c);
    if (idx === -1) continue;
    bits = (bits << 5) | idx;
    value += 5;
    if (value >= 8) {
      bytes.push((bits >>> (value - 8)) & 255);
      value -= 8;
    }
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 30000) + offset;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const h = crypto.createHmac("sha1", key).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String(
    (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6,
  ).padStart(6, "0");
}

const INSPECTOR = {
  email: "inspector1@simran.local",
  password: "Simran#2026",
};
const QH = {
  email: "qh@simran.local",
  password: "Simran#2026",
  totp: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
};
const ADMIN = {
  email: "admin@simran.local",
  password: "Simran#2026",
};

async function signIn(
  page: Page,
  who: { email: string; password: string; totp?: string },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  if (who.totp) {
    const field = page.getByLabel(/authenticator|code/i).first();
    await field.waitFor({ state: "visible", timeout: 10_000 });
    await field.fill(totpCode(who.totp));
    await page.getByRole("button", { name: /Verify/i }).click();
    await field.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  }
  await expect(page.getByRole("heading", { name: "Inspection batches" })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe.configure({ mode: "serial" });

const PO = `PO-ILL-${String(Date.now()).slice(-6)}`;

test("stage 0 — Item Master", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/admin/items");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/00-item-master.png`, fullPage: true });

  await page.locator("tbody tr").first().getByRole("button").first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/00-item-editor.png`, fullPage: true });
});

test("stage 1 — dashboard and new batch header", async ({ page }) => {
  await signIn(page, INSPECTOR);
  await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });

  await page.getByRole("button", { name: "New dimensional", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New dimensional batch" })).toBeVisible();
  // First item = W1G00005572 (recent-first)
  await page.getByRole("button", { name: /·/ }).first().click();
  await page.getByLabel("PO number").fill(PO);
  await page.getByLabel("Delivery batch").fill("2609-01");
  await page.getByLabel("Lot quantity").fill("120");
  await page.screenshot({ path: `${OUT}/01-new-batch-header.png`, fullPage: true });
  await page.getByRole("button", { name: /Load Inspection Grid/ }).click();
  await expect(page.getByTestId("grid-scroll")).toBeVisible();
  await page.waitForTimeout(1200);
});

test("stage 2 — grid: FAIL, bulk instrument, submit", async ({ page }) => {
  // Serial run: reuse the URL from the previous test via storageState-free path.
  await signIn(page, INSPECTOR);
  await page.goto("/");
  // Draft persisted — open it from the drafts strip.
  const draft = page.locator("tbody tr", { hasText: PO }).first();
  await draft.getByRole("link").first().click();
  await expect(page.getByTestId("grid-scroll")).toBeVisible();

  // The teaching value on row 8: FAIL demonstration
  await page.getByLabel("Row 8 sample 01").fill("100.60");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-grid-fail.png`, fullPage: false });

  // Correct it, then fill the grid
  await page.getByLabel("Row 8 sample 01").fill("100.10");
  await page.getByRole("button", { name: "Fill Nominal" }).click();
  await page.getByLabel("Apply one instrument to all rows").selectOption({ index: 1 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-grid-complete.png`, fullPage: true });

  await page.getByRole("button", { name: "Submit for review" }).click();
  // Post-condition: back on the dashboard (batch no longer DRAFT)
  await expect(page.getByRole("button", { name: "New dimensional", exact: true })).toBeVisible({
    timeout: 30_000,
  });
});

test("stage 3 — coating record sections A–E", async ({ page }) => {
  await signIn(page, INSPECTOR);
  await page.goto("/");
  // Create a fresh draft lot and follow its coating link (the link only
  // renders on a DRAFT dimensional batch).
  await page.getByRole("button", { name: "New dimensional", exact: true }).click();
  await page.getByRole("button", { name: /·/ }).first().click();
  await page.getByLabel("PO number").fill(`PO-ILL-COAT-${String(Date.now()).slice(-6)}`);
  await page.getByLabel("Delivery batch").fill("2609-02");
  await page.getByLabel("Lot quantity").fill("60");
  await page.getByRole("button", { name: /Load Inspection Grid/ }).click();
  await expect(page.getByTestId("grid-scroll")).toBeVisible();
  await page
    .getByRole("link", { name: /Coating batch for this lot/ })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/03-coating-handoff.png`, fullPage: true });

  // Inherited header hand-off → start the wizard
  await page.getByRole("button", { name: /Start Coating Wizard/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/03-coating-a.png`, fullPage: true });

  // Section B is wizard step 1 ("Conditions"); forward Continue is gated per
  // section — fill Section A (COAT-01/02) first.
  await page.locator("#sp-steel").fill("Carbon steel");
  await page.locator("#sp-method").fill("Grit blast");
  await page.locator("#sp-grade").fill("Sa 2.5");
  await page.locator("#sp-profile").fill("60");
  await page.locator("#sp-comparator").selectOption({ index: 2 });
  await page.locator("#sp-gauge").selectOption({ index: 1 });
  // Pre-treatment verification checkboxes (ISO 8501-3 P-2) — all three required
  for (const label of [
    "Welds / edges dressed smooth (P-2)",
    "Solvent clean per ISO 12944-4",
    "Water break test — no beading",
  ]) {
    await page.getByRole("checkbox", { name: label }).check();
  }
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Continue/ }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/03-coating-b-empty.png`, fullPage: true });

  // Safe take: dew point ≈ 13.9 °C, ΔT ≈ 16.1 °C → APPLICATION PERMITTED
  await page.locator("#psy-steel").fill("30.0");
  await page.locator("#psy-ambient").fill("25.0");
  await page.locator("#psy-rh").fill("50");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-coating-b-safe.png`, fullPage: false });

  // RH 90 % → APPLICATION PROHIBITED (the ISO 12944 lock-out)
  await page.locator("#psy-rh").fill("90");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-coating-b-locked.png`, fullPage: false });
});

test("stage 4 — QH review queue, TOTP, approve", async ({ page }) => {
  await signIn(page, QH);
  await page.goto("/review");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/04-review-queue.png`, fullPage: true });

  const row = page.locator("tbody tr", { hasText: PO });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("link").first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/04-review-record.png`, fullPage: true });

  await page.getByRole("button", { name: /Approve & Sign/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/04-approve-modal.png` });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.getByText("Batch approved", { exact: true })).toBeVisible();
});

test("stage 5 — report render", async ({ page }) => {
  await signIn(page, INSPECTOR);
  // The seeded approved batch (PO-DEMO-APP) — deterministic target.
  await page.goto("/reports/00000000-0000-4000-8000-000000000102");
  // The loading overlay is a fixed element; wait for the sheet identity
  // itself, then settle before shooting (fullPage + fixed overlay can smear).
  await expect(page.getByText(/ST\/QC\/0[24]/).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/05-report-stqc02.png`, fullPage: false });
});

test("stage 6 — instrument recall + NCR register", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/admin/instruments");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/06-instruments.png`, fullPage: true });

  // Open the usage-recall drawer via the row's "History" button (not Edit).
  await page.getByRole("button", { name: "History" }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/06-instrument-drawer.png`, fullPage: true });

  await page.goto("/ncr");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/06-ncr-register.png`, fullPage: true });
});
