import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { nextStatus } from "../batch-state";
import { MIN_DELTA_T_C } from "../dew-point";
import { ISO_19840_MIN_READINGS } from "../dft-stats";
import { MAX_RH_PERCENT } from "../coating";

/**
 * Schema ↔ domain parity tests — F-07 partial closure (Phase 1, step 10).
 *
 * These run WITHOUT Docker/Postgres: they statically parse the committed SQL
 * migrations and assert that the contract expressed there matches the domain
 * layer. A migration change without a matching test change fails review
 * (testing-quality-plan.md §6) — these tests make that drift a red test.
 *
 * The behavioural suite (RLS matrix role×table×operation, trigger firing incl.
 * service-role attempts, RPC transactions) runs against staging Supabase once
 * provisioned — execution-plan.md Phase 1 definition of done.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/** Lower-cased, whitespace-collapsed — for structural/keyword assertions. */
const migration = (name: string): string =>
  readFileSync(path.join(MIGRATIONS_DIR, name), "utf8").replace(/\s+/g, " ").toLowerCase();

/** Whitespace-collapsed but case-preserving — for exact error-contract codes. */
const migrationExact = (name: string): string =>
  readFileSync(path.join(MIGRATIONS_DIR, name), "utf8").replace(/\s+/g, " ");

const m001 = migration("20260915_001_core_schema.sql");
const m002 = migration("20260915_002_constraints.sql");
const m003 = migration("20260915_003_triggers.sql");
const m004 = migration("20260915_004_rls.sql");
const m005 = migration("20260915_005_rpcs.sql");
const m005Exact = migrationExact("20260915_005_rpcs.sql");
const m007 = migration("20260915_007_coating_sections.sql");

/** Every §2.1 entity (backend-architecture.md). */
const TABLES = [
  "profiles",
  "customers",
  "items",
  "drawing_revisions",
  "dimension_rows",
  "coating_specs",
  "batches",
  "readings",
  "coat_logs",
  "dft_readings",
  "sign_offs",
  "instruments",
  "audit_log",
] as const;

describe("migration 001 — core schema", () => {
  it("creates every §2.1 table", () => {
    for (const t of TABLES) {
      expect(m001).toContain(`create table public.${t} (`);
    }
  });

  it("creates referenced tables before their referencers (no deferred DDL)", () => {
    // Edge case 1.13 fixture: instruments precede readings (FK target).
    expect(m001.indexOf("create table public.instruments")).toBeLessThan(
      m001.indexOf("create table public.readings"),
    );
  });

  it("enforces one value per sample cell / grid point / role (§2.2 uniques)", () => {
    expect(m001).toContain("unique (batch_id, dimension_row_id, sample_no)");
    expect(m001).toContain("unique (batch_id, side, point_no)");
    expect(m001).toContain("unique (batch_id, role)");
  });

  it("never hard-deletes referenced instruments — soft retire state (edge 1.13)", () => {
    expect(m001).toContain("retired_at");
  });
});

describe("migration 002 — constraints", () => {
  it("brackets the nominal with materialized limits, equality allowed (IM-03, edge 1.1)", () => {
    expect(m002).toContain(
      "check (nominal - tol_minus <= nominal and nominal <= nominal + tol_plus)",
    );
  });

  it("requires non-negative tolerance magnitudes (edge 1.2)", () => {
    expect(m002).toContain("check (tol_plus >= 0 and tol_minus >= 0)");
  });

  it("matches the Zod delivery-batch-code grammar exactly (PRD §6, edge 1.12)", () => {
    // Mirrors batchHeaderSchema in src/domain/schemas.ts — change together.
    expect(m002).toContain("'^\\d{4}-\\d{2}$'");
  });
});

describe("migration 003 — triggers & state machine", () => {
  const LEGAL_EDGES = [
    { from: "DRAFT", via: "submit", to: "SUBMITTED" },
    { from: "SUBMITTED", via: "reject", to: "DRAFT" },
    { from: "SUBMITTED", via: "approve", to: "APPROVED" },
    { from: "REJECTED", via: "revise", to: "DRAFT" },
  ] as const;

  it("guard trigger legal edges equal the domain state machine (application-flow.md)", () => {
    for (const e of LEGAL_EDGES) {
      expect(nextStatus(e.from, e.via)).toBe(e.to); // domain side
      expect(m003).toContain(
        `old.status = '${e.from.toLowerCase()}' and new.status = '${e.to.toLowerCase()}'`,
      ); // database side
    }
  });

  it("leaves no illegal edge reachable (edge 1.9)", () => {
    expect(m003).not.toContain("old.status = 'rejected' and new.status = 'submitted'");
    expect(m003).not.toContain("old.status = 'draft' and new.status = 'approved'");
  });

  it("treats APPROVED as terminal — immutability is unconditional (SO-04, edge 1.8)", () => {
    expect(nextStatus("APPROVED", "submit")).toBeNull();
    expect(m003).toContain("if old.status = 'approved' then");
    expect(m003).toContain("forbid_approved_mutation");
  });

  it("locks revision_id after first submit (IM-05, edge 1.14)", () => {
    expect(m003).toContain("revision_id is locked after first submit");
  });

  it("keeps audit_log append-only at the privilege level (§3.2)", () => {
    expect(m003).toContain("revoke update, delete on public.audit_log");
  });

  it("defines each trigger function before its trigger (valid DDL order)", () => {
    expect(m003.indexOf("create or replace function public.guard_batches_mutation")).toBeLessThan(
      m003.indexOf("create trigger batches_immutable"),
    );
    expect(m003.indexOf("create or replace function public.forbid_approved_mutation")).toBeLessThan(
      m003.indexOf("create trigger readings_immutable"),
    );
  });
});

describe("migration 004 — RLS", () => {
  it("enables RLS on every table (§4)", () => {
    for (const t of TABLES) {
      expect(m004).toContain(`alter table public.${t} enable row level security`);
    }
  });

  it("reads role from profiles, never from a JWT claim (edge 2.15)", () => {
    expect(m004).toContain("create or replace function public.auth_role()");
  });

  it("gives sign_offs no insert/update policy for anyone — RPC only (SO-01, edge 1.4)", () => {
    expect(m004).toContain("create policy sign_offs_select");
    expect(m004).not.toMatch(/create policy sign_offs_\w+ for (insert|update|delete)/);
  });

  it("gives audit_log no write policy — trigger/SECURITY DEFINER only (§3.2)", () => {
    expect(m004).not.toMatch(/create policy audit_log_\w+ for (insert|update|delete)/);
  });
});

describe("migration 005 — RPCs vs domain engines", () => {
  it("recomputes dew point with the exact Magnus-Tetens constants of dew-point.ts (edge 1.10)", () => {
    expect(m005).toContain("17.62");
    expect(m005).toContain("243.12");
  });

  it("applies the same lock-out gate: ΔT < 3.0 °C OR RH > 85 % blocks, boundaries pass (COAT-03, edges 1.3/4.1/4.4)", () => {
    expect(MIN_DELTA_T_C).toBe(3.0);
    expect(MAX_RH_PERCENT).toBe(85);
    expect(m005).toContain("v_delta_t < 3.0");
    expect(m005).not.toContain("v_delta_t <= 3.0");
    expect(m005).toContain("v_rec.rh_pct > 85.0");
    expect(m005).not.toContain("v_rec.rh_pct >= 85.0");
  });

  it("gates ISO 19840 breaches with strict thresholds matching dft-stats.ts (edge 1.11)", () => {
    expect(ISO_19840_MIN_READINGS).toBe(5);
    expect(m005).toContain("value_um < 0.8 *");
    expect(m005).toContain("value_um > 2.0 *");
    expect(m005).not.toContain("value_um <= 0.8 *");
    expect(m005).not.toContain("value_um >= 2.0 *");
    expect(m005).toContain("80/200 breach");
  });

  it("evaluates tolerance on-limit as passing (strict breach, edge 1.3)", () => {
    expect(m005).toContain("r.value_mm >= (d.nominal - d.tol_minus)");
    expect(m005).toContain("r.value_mm <= (d.nominal + d.tol_plus)");
  });

  it("enforces the psychrometric input bounds of psychrometricSchema (schemas.ts)", () => {
    expect(m005).toContain("v_rec.rh_pct <= 0 or v_rec.rh_pct > 100");
    expect(m005).toContain("< -45");
    expect(m005).toContain("> 60");
  });

  it("raises on self-approval (edge 1.4) and demands rejection comments (edge 1.5)", () => {
    expect(m005).toContain("self-approval forbidden");
    expect(m005).toContain("rejection requires comments");
  });

  it("guards the decision race: exactly SUBMITTED batches may be decided (edges 5.2/5.3)", () => {
    expect(m005).toContain("v_batch.status is distinct from 'submitted'");
    expect(m005).toContain("decision race guarded");
  });

  it("requires an MFA-verified session (AAL2) for QH decisions (edge 2.14)", () => {
    // Fail-closed: a missing `aal` claim coalesces to aal1 and is refused.
    expect(m005).toContain("coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'");
    expect(m005Exact).toContain("BT_MFA");
  });

  it("gates controlled-document export on APPROVED and logs it (report-export-spec §7, edge 6.9)", () => {
    expect(m005).toContain("export is gated on approved");
    expect(m005).toContain("'export'");
    expect(m005).toContain("channel must be print or email");
  });

  it("uses the BT_* error contract (api-integration-conventions.md §5)", () => {
    for (const code of ["BT_LOCK", "BT_STATE", "BT_VALID", "BT_AUTH"]) {
      expect(m005Exact).toContain(code);
    }
  });

  it("is executable by authenticated only — anon revoked", () => {
    expect(m005).toContain("revoke execute on function public.submit_batch(uuid, jsonb) from anon");
    expect(m005).toContain(
      "grant execute on function public.submit_batch(uuid, jsonb) to authenticated",
    );
    expect(m005).toContain(
      "revoke execute on function public.decide_batch(uuid, text, text) from anon",
    );
    expect(m005).toContain(
      "grant execute on function public.decide_batch(uuid, text, text) to authenticated",
    );
  });
});

describe("migration 007 — coating sections", () => {
  it("persists Section A surface prep and Section E visual checks (steps 2/6)", () => {
    expect(m007).toContain("create table public.batch_coating (");
    expect(m007).toContain("create table public.batch_visual_checks (");
    expect(m007).toContain("primary key (batch_id, defect)");
  });

  it("defaults match the COAT-01/02 paper presets", () => {
    expect(m007).toContain("default 'ms sheet fabrication'");
    expect(m007).toContain("default 'abrasive blast cleaning'");
    expect(m007).toContain("default 'sa 2.5'");
    expect(m007).toContain("default 'g-40'");
  });

  it("restricts the COAT-07 defect list to exactly the five paper rows", () => {
    for (const d of ["pinholes", "sagging", "gloss_loss", "peel_off", "blisters"]) {
      expect(m007).toContain(`'${d}'`);
    }
    expect(m007).toContain("check (defect in");
  });

  it("keeps the profile reading non-negative and assigns the gauge per batch (edges 4.10/4.12)", () => {
    expect(m007).toContain("check (profile_um >= 0");
    expect(m007).toContain("profile_gauge_instrument_id uuid references public.instruments (id)");
  });

  it("mirrors the coat_logs RLS shape: owner/QH read, owner-DRAFT write (§4)", () => {
    expect(m007).toContain("alter table public.batch_coating enable row level security");
    expect(m007).toContain("alter table public.batch_visual_checks enable row level security");
    expect(m007).toContain("create policy batch_coating_select on public.batch_coating");
    expect(m007).toContain("create policy batch_coating_write_own_draft on public.batch_coating");
    expect(m007).toContain(
      "create policy batch_visual_checks_select on public.batch_visual_checks",
    );
    expect(m007).toContain(
      "create policy batch_visual_checks_write_own_draft on public.batch_visual_checks",
    );
  });
});
