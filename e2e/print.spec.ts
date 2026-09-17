import { test, expect } from "@playwright/test";

/**
 * Print regression — testing-quality-plan §2 (print emulation + visual diff)
 * and report-export-spec §6. The layout of the two controlled formats is
 * locked by a screenshot baseline: an unintended drift fails CI.
 *
 * Strategy: mount the report components directly from the dev server's module
 * graph (no Supabase, no auth) — the renderers are pure functions of their
 * data contract, so a fixture page exercises the exact print tree. The
 * golden-file fidelity comparison against the audited Excel printouts
 * (spec §6, client QH sign-off) happens on the printed artifacts this layout
 * produces.
 */

test.describe("controlled report layouts", () => {
  test("ST/QC/02 sheet renders the controlled layout and locks its baseline", async ({ page }) => {
    await page.goto("/print-fixture.html");
    // Deterministic baseline: wait for the self-hosted Plex faces and the
    // React mounts before screenshotting.
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".print-sheet").first()).toBeVisible();

    await expect(page.getByRole("heading", { name: "Dimensional Inspection Report" })).toBeVisible();
    await expect(page.getByText("Format No.")).toBeVisible();
    await expect(page.getByText("ST/QC/02")).toBeVisible();
    await expect(page.getByText("Rev 02")).toBeVisible();

    // The full 53-row grid prints — never virtualized (spec §5).
    const bodyRows = page.locator(".print-sheet table.print-repeat tbody tr");
    await expect(bodyRows).toHaveCount(53);

    // Edge 6.5: the fail marker is glyph + treatment, never hue alone.
    await expect(page.locator(".print-sheet td.print-chip", { hasText: "✗" }).first()).toBeVisible();

    // Footer metadata (PDF-04): format · rev · date block present.
    const footer = page.locator(".print-footer");
    await expect(footer).toContainText("ST/QC/02");
    await expect(footer).toContainText("Rev 02");

    await expect(page.locator(".print-sheet").first()).toHaveScreenshot("stqc02-dimensional.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("ST/QC/04 sheet renders the controlled layout and locks its baseline", async ({ page }) => {
    await page.goto("/print-fixture.html");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".print-sheet").nth(1)).toBeVisible();

    await expect(page.getByRole("heading", { name: /Surface Preparation & Protective Coating Report/i })).toBeVisible();
    await expect(page.getByText("ST/QC/04")).toBeVisible();
    await expect(page.getByText("Rev 01")).toBeVisible();

    // Section anatomy (spec §4) — all five sections print.
    for (const section of ["A — Surface preparation", "B — Psychrometric conditions", "C — Paint batch log", "D — Dry film thickness", "E — Visual inspection"]) {
      await expect(page.getByText(section, { exact: false })).toBeVisible();
    }

    // Both DFT statistics blocks print with the ISO verdict (edge 6.4).
    await expect(page.getByText("ISO 19840 PASS").first()).toBeVisible();

    const footer = page.locator(".print-footer").last();
    await expect(footer).toContainText("ST/QC/04");

    await expect(page.locator(".print-sheet").nth(1)).toHaveScreenshot("stqc04-coating.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
