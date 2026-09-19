import { test, expect } from "@playwright/test";
import { inspectorCredentials, qhCredentials, qhTotpSecret, signIn } from "./helpers";

/**
 * End-to-end journeys (testing-quality-plan §2).
 *
 * These drive the real running app against a seeded Supabase project. They are
 * gated on credentials so `npm run test:e2e` stays green on a bare checkout —
 * set the E2E_* env vars (see e2e/helpers.ts) to activate them.
 *
 * What each journey pins:
 *   J1  Inspector creates a dimensional batch, enters a reading, and the
 *       draft survives a reload — the Dexie autosave contract (DIM-07).
 *   J2  QH sees the submitted worklist and a read-only record on which the
 *       author never sees the decision buttons (edge 5.9 separation of duties).
 *   J3  An approved batch offers its controlled report (report-export-spec §7).
 *   J4  A reading entered while offline persists through a reload (offline §2).
 */

test.describe("J1 — inspector creates a dimensional batch and autosave holds", () => {
  const creds = inspectorCredentials();

  test.skip(creds === null, "set E2E_INSPECTOR_EMAIL / E2E_INSPECTOR_PASSWORD");
  test("draft survives a reload", async ({ page }) => {
    if (creds === null) return;
    await signIn(page, creds);

    await page.getByRole("button", { name: "New dimensional", exact: true }).click();
    await expect(page.getByRole("heading", { name: "New dimensional batch" })).toBeVisible();

    // First item in the picker (recent-first list, C5).
    await page.getByRole("button", { name: /·/ }).first().click();
    await page.getByLabel("PO number").fill(`PO-E2E-${String(Date.now()).slice(-6)}`);
    await page.getByLabel("Delivery batch").fill("2609-01");
    await page.getByLabel("Lot quantity").fill("10");
    await page.getByRole("button", { name: /Load Inspection Grid/ }).click();

    await expect(page.getByTestId("grid-scroll")).toBeVisible();
    // Row 1 is the locked reference dimension — use row 2 (editable).
    const firstCell = page.getByLabel("Row 2 sample 01");
    await firstCell.fill("42.5");
    await firstCell.blur();
    // Let the debounced (~300 ms) Dexie write-through commit before reloading.
    await page.waitForTimeout(800);

    // Dexie write-through: the entered value must reappear after a reload.
    await page.reload();
    await expect(page.getByLabel("Row 2 sample 01")).toHaveValue("42.5");
  });
});

test.describe("J2 — QH review queue, MFA sign-in and the real approval", () => {
  const qh = qhCredentials();
  const totpSecret = qhTotpSecret();

  test.skip(qh === null, "set E2E_QH_EMAIL / E2E_QH_PASSWORD");

  test("the worklist opens a submitted record with the decision bar", async ({ page }) => {
    if (qh === null) return;
    await signIn(page, { ...qh, totpSecret });

    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();

    // Wait for the queue query to resolve instead of sampling immediately —
    // a slow load must not read as "empty queue" and silently skip.
    const firstRow = page.locator("tbody tr").first();
    const offered = await firstRow
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!offered) {
      test.skip(true, "no SUBMITTED batches in the queue — seed one first");
      return;
    }
    await firstRow.getByRole("link").first().click();

    // The QH is not the author, so the decision bar is offered (edge 5.9).
    await expect(page.getByRole("button", { name: /Approve/ })).toBeVisible();
  });

  test("the author sees the record read-only (separation of duties)", async ({ page }) => {
    const author = inspectorCredentials();
    if (author === null) return;
    await signIn(page, author);

    // B1 in the seed — a SUBMITTED batch authored by the seeded QC Inspector.
    await page.goto("/review/00000000-0000-4000-8000-000000000101");
    await expect(
      page.getByText(/Read-only — decisions reserved to Quality Head/),
    ).toBeVisible();
    // Edge 5.9: the author is never offered the decision controls.
    await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  });

  test("QH approves a submitted batch through the TOTP-gated decision (SO-01…04)", async ({
    page,
  }) => {
    const author = inspectorCredentials();
    if (qh === null || author === null) return;

    // 1. The inspector builds and submits a fresh batch (Fill Nominal + bulk
    //    instrument make the 53-row grid submission-ready in a few clicks).
    const po = `PO-APR-${String(Date.now()).slice(-6)}`;
    await signIn(page, author);
    await page.getByRole("button", { name: "New dimensional", exact: true }).click();
    await page.getByRole("button", { name: /·/ }).first().click();
    await page.getByLabel("PO number").fill(po);
    await page.getByLabel("Delivery batch").fill("2609-03");
    await page.getByLabel("Lot quantity").fill("10");
    await page.getByRole("button", { name: /Load Inspection Grid/ }).click();
    await expect(page.getByTestId("grid-scroll")).toBeVisible();
    await page.getByLabel("Apply one instrument to all rows").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Fill Nominal" }).click();
    await page.getByRole("button", { name: "Submit for review" }).click();
    // The submit's durable post-condition: the route hands control back to
    // the dashboard once the server has accepted the batch. Signing out
    // before this lands aborts the in-flight RPC and the batch stays DRAFT —
    // the race this wait removes.
    await expect(page.getByRole("button", { name: "New dimensional" })).toBeVisible({
      timeout: 30_000,
    });

    // 2. Sign out; the QH signs in with a REAL TOTP challenge — the decision
    //    bar and the server both demand an AAL2 session (edge 5.5).
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, { ...qh, totpSecret });

    await page.goto("/review");
    const row = page.locator("tbody tr", { hasText: po });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("link").first().click();

    // 3. Approve & Sign: modal demands the flag acknowledgement, then commit.
    await page.getByRole("button", { name: /Approve & Sign/ }).click();
    await page
      .getByRole("checkbox")
      .check(); // "I have reviewed the flagged item(s)" (edge 5.1)
    await page.getByRole("button", { name: "Confirm approval" }).click();
    await expect(page.getByText("Batch approved", { exact: true })).toBeVisible();

    // 4. The decision is durable: the queue no longer lists the batch.
    await page.goto("/review");
    await expect(page.locator("tbody tr", { hasText: po })).toHaveCount(0);
  });
});

test.describe("J3 — approved batch offers its controlled report", () => {
  const creds = inspectorCredentials();

  test.skip(creds === null, "set E2E_INSPECTOR_EMAIL / E2E_INSPECTOR_PASSWORD");
  test("report link is offered for an approved batch", async ({ page }) => {
    if (creds === null) return;
    await signIn(page, creds);

    // The link only exists once the batch list resolves, so wait for it
    // instead of sampling immediately — otherwise a slow query reads as
    // "no approved batches" and the journey silently skips.
    const reportLink = page.getByRole("link", { name: "Report" }).first();
    const offered = await reportLink
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!offered) {
      test.skip(true, "no APPROVED batches on the dashboard — approve one first");
      return;
    }
    await reportLink.click();
    // The controlled format identity line is the report's proof of render.
    // The report route assembles its data async ("preparing sheet…" overlay),
    // which can outlast the default 5s expectation timeout.
    await expect(page.getByText(/ST\/QC\/0[24]/).first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("J4 — offline entry persists", () => {
  const creds = inspectorCredentials();

  test.skip(creds === null, "set E2E_INSPECTOR_EMAIL / E2E_INSPECTOR_PASSWORD");
  test("a reading typed offline survives a reload", async ({ page, context }) => {
    if (creds === null) return;
    await signIn(page, creds);

    await page.getByRole("button", { name: "New dimensional", exact: true }).click();
    await page.getByRole("button", { name: /·/ }).first().click();
    await page.getByLabel("PO number").fill(`PO-OFF-${String(Date.now()).slice(-6)}`);
    await page.getByLabel("Delivery batch").fill("2609-02");
    await page.getByLabel("Lot quantity").fill("10");
    await page.getByRole("button", { name: /Load Inspection Grid/ }).click();
    await expect(page.getByTestId("grid-scroll")).toBeVisible();
    // Wait for the rows to actually paint before cutting the network — the
    // scroll container mounts a beat before the virtualizer lays out cells.
    await expect(page.getByLabel("Row 2 sample 01")).toBeVisible();

    // Type with no connection — Dexie (not the network) must hold the value.
    await context.setOffline(true);
    const cell = page.getByLabel("Row 2 sample 02");
    await cell.fill("7.25");
    await cell.blur();
    // Let the debounced Dexie write-through commit before reloading.
    await page.waitForTimeout(800);

    // Reconnect before reload (the dev server serves assets over the network).
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByLabel("Row 2 sample 02")).toHaveValue("7.25");
  });
});
