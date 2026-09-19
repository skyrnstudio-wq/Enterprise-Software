import { test, expect } from "@playwright/test";
import { extractPdfText } from "./pdf-text";

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
    await expect(page.getByText("Format No.").first()).toBeVisible();
    // `.first()` — the format identity prints twice on a sheet (letterhead
    // block plus the static footer), so the bare locator is ambiguous.
    await expect(page.getByText("ST/QC/02").first()).toBeVisible();
    await expect(page.getByText("Rev 02").first()).toBeVisible();

    // The full 53-row grid prints — never virtualized (spec §5). Scoped to the
    // dimensional sheet: the coating sheet's DFT grids are also .print-repeat.
    const dimensional = page.locator(".print-sheet").first();
    const bodyRows = dimensional.locator("table.print-repeat tbody tr");
    await expect(bodyRows).toHaveCount(53);

    // Edge 6.5: the fail marker is glyph + treatment, never hue alone.
    await expect(page.locator(".print-sheet td.print-chip", { hasText: "✗" }).first()).toBeVisible();

    // Footer metadata (PDF-04): format · rev · date block present.
    const footer = dimensional.locator(".print-footer");
    await expect(footer).toContainText("ST/QC/02");
    await expect(footer).toContainText("Rev 02");

    await expect(page.locator(".print-sheet").first()).toHaveScreenshot("stqc02-dimensional.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("the printed artifact paginates and carries a running footer on every page", async ({
    page,
  }) => {
    await page.goto("/print-fixture.html");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".print-sheet").first()).toBeVisible();
    await expect(page.locator(".print-sheet").nth(1)).toBeVisible();

    // Pagination and the `@page` margin box live outside the DOM, so they can
    // only be checked on the artifact the browser actually prints.
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const artifact = extractPdfText(pdf);

    // Both controlled formats are in the stream, and it is genuinely paginated.
    expect(artifact.text).toContain("ST/QC/02");
    expect(artifact.text).toContain("ST/QC/04");
    expect(artifact.pageCount).toBeGreaterThanOrEqual(2);

    // D37: `Page n of m` from the running footer, once per page, in order —
    // and `m` agrees with the real page count.
    expect(artifact.footers).toEqual(
      Array.from({ length: artifact.pageCount }, (_, i) => `Page ${String(i + 1)} of ${String(artifact.pageCount)}`),
    );
  });

  test("ST/QC/04 sheet renders the controlled layout and locks its baseline", async ({ page }) => {
    await page.goto("/print-fixture.html");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".print-sheet").nth(1)).toBeVisible();

    await expect(page.getByRole("heading", { name: /Surface Preparation & Protective Coating Report/i })).toBeVisible();
    await expect(page.getByText("ST/QC/04").first()).toBeVisible();
    await expect(page.getByText("Rev 01").first()).toBeVisible();

    // Section anatomy (spec §4) — all five sections print.
    for (const section of ["A — Surface preparation", "B — Psychrometric conditions", "C — Paint batch log", "D — Dry film thickness", "E — Visual inspection"]) {
      await expect(page.getByText(section, { exact: false })).toBeVisible();
    }

    // Both DFT statistics blocks print with the ISO verdict (edge 6.4).
    await expect(page.getByText("ISO 19840 PASS").first()).toBeVisible();

    const coating = page.locator(".print-sheet").nth(1);
    const footer = coating.locator(".print-footer").last();
    await expect(footer).toContainText("ST/QC/04");

    await expect(page.locator(".print-sheet").nth(1)).toHaveScreenshot("stqc04-coating.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
