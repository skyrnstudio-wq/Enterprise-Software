import { createHmac, type BinaryLike } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/**
 * Shared E2E helpers for the journey specs.
 *
 * Credentials come from the environment so the suite stays secret-free:
 *   E2E_INSPECTOR_EMAIL / E2E_INSPECTOR_PASSWORD
 *   E2E_QH_EMAIL        / E2E_QH_PASSWORD
 *   E2E_QH_TOTP_SECRET  — base32 secret of the QH's seeded TOTP factor
 *                         (public test material; see supabase/seed.sql)
 * Point E2E_BASE_URL at the running app (defaults to http://localhost:5173).
 */

export interface Credentials {
  email: string;
  password: string;
}

export function inspectorCredentials(): Credentials | null {
  const email = process.env.E2E_INSPECTOR_EMAIL;
  const password = process.env.E2E_INSPECTOR_PASSWORD;
  return email !== undefined && password !== undefined ? { email, password } : null;
}

export function qhCredentials(): Credentials | null {
  const email = process.env.E2E_QH_EMAIL;
  const password = process.env.E2E_QH_PASSWORD;
  return email !== undefined && password !== undefined ? { email, password } : null;
}

export function qhTotpSecret(): string | null {
  return process.env.E2E_QH_TOTP_SECRET ?? null;
}

// — TOTP (RFC 6238, SHA-1 / 6 digits / 30 s step — GoTrue's defaults) —

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase()) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Current (or `offsetSteps`-shifted) 6-digit code for a base32 secret. */
export function totpCode(secretB32: string, offsetSteps = 0): string {
  const timeStep = Math.floor(Date.now() / 30_000) + offsetSteps;
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const hmac = createHmac("sha1", base32Decode(secretB32) as BinaryLike)
    .update(counter)
    .digest();
  const last = hmac[hmac.length - 1] ?? 0;
  const offset = last & 0x0f;
  const bin =
    ((hmac[offset] ?? 0) & 0x7f) << 24 |
    ((hmac[offset + 1] ?? 0) & 0xff) << 16 |
    ((hmac[offset + 2] ?? 0) & 0xff) << 8 |
    (hmac[offset + 3] ?? 0) & 0xff;
  return String(bin % 1_000_000).padStart(6, "0");
}

/**
 * Signs in through the real S1 screen and waits for the dashboard.
 *
 * MFA-aware: when `who.totpSecret` is set and the platform raises the TOTP
 * step, the generated code is submitted through the same UI a human uses —
 * the challenge/verify round-trip is never bypassed.
 */
export async function signIn(page: Page, who: Credentials & { totpSecret?: string | null }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The QH is MFA-enforced (SO-01…04): after the password, the S1 screen swaps
  // to the authenticator-code step. Generate the code and verify — retrying
  // the previous window if the step boundary straddles a 30 s tick.
  const totpField = page.getByLabel("Authenticator code");
  try {
    await totpField.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    // No challenge raised — plain session, nothing to do.
  }
  if (await totpField.isVisible().catch(() => false)) {
    if (who.totpSecret === undefined || who.totpSecret === null) {
      throw new Error(
        `MFA challenge raised for ${who.email} but no E2E_QH_TOTP_SECRET is set — the seeded factor (supabase/seed.sql) supplies it.`,
      );
    }
    for (const offset of [0, -1]) {
      await totpField.fill(totpCode(who.totpSecret, offset));
      await page.getByRole("button", { name: /Verify & sign in/ }).click();
      // The field vanishing means the challenge was accepted; if the screen
      // still shows it, the code was stale — retry with the previous window.
      const gone = await totpField
        .waitFor({ state: "hidden", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (gone) break;
    }
  }

  // Dashboard heading is the earliest proof the session landed (S2). Generous
  // timeout: the first dashboard paint waits on the batch query round-trip.
  await expect(page.getByRole("heading", { name: "Inspection batches" })).toBeVisible({
    timeout: 20_000,
  });
}
