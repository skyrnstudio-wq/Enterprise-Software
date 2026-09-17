import { useMemo } from "react";
import { Caption, StatusChip } from "@/components/ui/StatusChip";
import type { ChipStatus } from "@/components/ui/StatusChip";
import { CompliancePanel } from "@/components/ui/CompliancePanel";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { computeDftStats, evaluateIso19840 } from "@/domain/dft-stats";
import type { DftStats } from "@/domain/dft-stats";
import {
  evaluatePsychroGate,
  parseCoatingNumber,
  shelfLifeStatus,
  evaluateProfileUm,
  evaluateWftUm,
} from "@/domain/coating";
import { dewPoint } from "@/domain/dew-point";
import type { Celsius, PercentRH } from "@/domain/measurement";
import type { PsychroVerdict } from "@/domain/coating";

/**
 * Coating feature components — ui-ux-plan §7.3/§5 + execution-plan Phase 4
 * steps 3/5/7. Every verdict here is derived (ƒx), never stored (edge 4.7):
 * the recorded truth is the operator's entries; the server recomputes at
 * submit.
 */

// ---------------------------------------------------------------------------
// Section B — Psychrometric lock-out panel (COAT-03, edges 4.1–4.6)
// ---------------------------------------------------------------------------

const PSYCHRO_PLACEHOLDER = "—";

export function PsychrometricPanel({
  steelRaw,
  ambientRaw,
  rhRaw,
  onChange,
  disabled = false,
}: {
  /** Raw cell contents — parsing happens here (decimal-comma mask, 4.16). */
  steelRaw: string;
  ambientRaw: string;
  rhRaw: string;
  onChange: (field: "steel" | "ambient" | "rh", raw: string) => void;
  disabled?: boolean;
}) {
  const steel = parseCoatingNumber(steelRaw);
  const ambient = parseCoatingNumber(ambientRaw);
  const rh = parseCoatingNumber(rhRaw);

  const gate: PsychroVerdict | null =
    steel !== null && ambient !== null && rh !== null
      ? evaluatePsychroGate(steel, ambient, rh)
      : null;

  const locked = gate?.locked ?? false;
  const deltaT = gate !== null && Number.isFinite(gate.deltaT) ? gate.deltaT : null;
  const td = ambient !== null && rh !== null ? dewPoint(ambient as Celsius, rh as PercentRH) : null;

  const readout =
    deltaT === null
      ? PSYCHRO_PLACEHOLDER
      : `${deltaT >= 0 ? "+" : "−"}${Math.abs(deltaT).toFixed(2)}`;

  return (
    <CompliancePanel
      title="Dew point compliance"
      tag="AUTO-CALC"
      readout={readout}
      unit="°C ΔT"
      status={locked ? "fail" : gate === null ? "info" : "pass"}
      {...(gate !== null && gate.locked ? { note: gate.message } : {})}
    >
      <dl className="measurement grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-500">T dew ƒx</dt>
          <dd className="text-ink-900">
            {td === null ? PSYCHRO_PLACEHOLDER : `${td.toFixed(1)} °C`}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-500">RH</dt>
          <dd className={rh !== null && rh > 85 ? "text-status-fail-fg" : "text-ink-900"}>
            {rh === null ? PSYCHRO_PLACEHOLDER : `${rh.toFixed(1)} %`}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Gate</dt>
          <dd>
            <StatusChip
              status={locked ? "fail" : gate === null ? "info" : "pass"}
              label={
                locked
                  ? "APPLICATION PROHIBITED"
                  : gate === null
                    ? "ENTER CONDITIONS"
                    : "APPLICATION PERMITTED"
              }
            />
          </dd>
        </div>
      </dl>
      <div className="mt-3 grid grid-cols-3 gap-4">
        <FormRow label="Steel °C" htmlFor="psy-steel">
          <TextInput
            id="psy-steel"
            inputMode="decimal"
            autoComplete="off"
            value={steelRaw}
            disabled={disabled}
            onChange={(e) => {
              onChange("steel", e.target.value);
            }}
          />
        </FormRow>
        <FormRow label="Ambient °C" htmlFor="psy-ambient">
          <TextInput
            id="psy-ambient"
            inputMode="decimal"
            autoComplete="off"
            value={ambientRaw}
            disabled={disabled}
            onChange={(e) => {
              onChange("ambient", e.target.value);
            }}
          />
        </FormRow>
        <FormRow label="RH %" htmlFor="psy-rh">
          <TextInput
            id="psy-rh"
            inputMode="decimal"
            autoComplete="off"
            value={rhRaw}
            disabled={disabled}
            onChange={(e) => {
              onChange("rh", e.target.value);
            }}
          />
        </FormRow>
      </div>
    </CompliancePanel>
  );
}

// ---------------------------------------------------------------------------
// Section D — DFT 26-point panel (COAT-05/06, edges 4.9–4.11)
// ---------------------------------------------------------------------------

function fmt(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? PSYCHRO_PLACEHOLDER
    : value.toFixed(digits);
}

export function DftPanel({
  sideLabel,
  system,
  nominal,
  readings,
  onChange,
  disabled = false,
}: {
  /** "Inside (C4 High)" / "Outside (C3 High)" per COAT-05. */
  sideLabel: string;
  system: string;
  nominal: number;
  readings: (number | null)[];
  onChange: (index: number, value: number | null) => void;
  disabled?: boolean;
}) {
  const stats: DftStats = useMemo(() => computeDftStats(readings, nominal), [readings, nominal]);
  const iso = evaluateIso19840(stats);

  const verdictChip: { status: ChipStatus; label: string } = iso.compliant
    ? { status: "pass", label: "ISO 19840 PASS" }
    : iso.reason === "below-80"
      ? { status: "fail", label: "READING < 80% NOMINAL" }
      : iso.reason === "above-200"
        ? { status: "fail", label: "READING > 200% NOMINAL" }
        : { status: "info", label: `MIN 5 READINGS (${String(stats.count)}/26)` };

  return (
    <div className="rounded-sm border border-ink-200 bg-paper-raised p-4">
      <div className="flex items-center justify-between">
        <Caption>
          <span className="mr-2 text-ink-700">D</span>
          {sideLabel} — {system}
        </Caption>
        <StatusChip status={verdictChip.status} label={verdictChip.label} />
      </div>

      <dl
        className="measurement mt-3 grid grid-cols-4 gap-4 text-sm"
        aria-label={`${sideLabel} live statistics`}
      >
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Min</dt>
          <dd className="text-ink-900">{fmt(stats.min)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Max</dt>
          <dd className="text-ink-900">{fmt(stats.max)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Avg ƒx</dt>
          <dd className="text-ink-900">{fmt(stats.mean)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-500">σ ƒx</dt>
          <dd className="text-ink-900">{fmt(stats.stdDev, 2)}</dd>
        </div>
      </dl>

      <div className="mt-3 grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1.5">
        {readings.map((value, i) => {
          const flagged = value !== null && (value < 0.8 * nominal || value > 2.0 * nominal);
          return (
            <label key={i} className="block">
              <span className="sr-only">{`${sideLabel} point ${String(i + 1)}`}</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                aria-label={`${sideLabel} point ${String(i + 1)}`}
                disabled={disabled}
                value={value === null ? "" : String(value)}
                onChange={(e) => {
                  onChange(i, parseCoatingNumber(e.target.value));
                }}
                className={`measurement h-8 w-full rounded-xs border px-1 text-center text-sm ${
                  flagged
                    ? "border-status-fail-fg bg-status-fail-bg text-status-fail-fg"
                    : value !== null
                      ? "border-ink-300 bg-paper-sunken text-ink-900"
                      : "border-ink-300 bg-paper-raised text-ink-900"
                } disabled:opacity-50`}
              />
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-500">
        {stats.count}/26 entered · nominal {nominal} µm · flagged readings breach the ISO 19840
        80/200 rule
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section C support — shelf-life chip (COAT-04, edges 4.13/4.14)
// ---------------------------------------------------------------------------

export function ShelfLifeChip({
  mfgDate,
  today,
  intervalMonths = 12,
}: {
  mfgDate: string | null;
  today: string;
  /** Product-dependent shelf-life interval; 12 months is the shop default. */
  intervalMonths?: number;
}) {
  const status = shelfLifeStatus(mfgDate, intervalMonths, today);
  switch (status.state) {
    case "expired":
      return <StatusChip status="fail" label="SHELF LIFE EXPIRED" />;
    case "expiring":
      return (
        <StatusChip
          status="warn"
          label={status.daysLeft === 0 ? "EXPIRES TODAY" : `EXPIRES IN ${String(status.daysLeft)}D`}
        />
      );
    case "ok":
      return <StatusChip status="pass" label="SHELF LIFE OK" />;
    default:
      return <StatusChip status="locked" label="MFG DATE NEEDED" />;
  }
}

// ---------------------------------------------------------------------------
// Section A/C support — profile & WFT verdict chips (COAT-02/04)
// ---------------------------------------------------------------------------

export function ProfileVerdictChip({ valueUm }: { valueUm: number | null }) {
  if (valueUm === null) return <StatusChip status="info" label="ENTER PROFILE µM" />;
  const v = evaluateProfileUm(valueUm);
  return (
    <StatusChip
      status={v === "pass" ? "pass" : v === "warn" ? "warn" : "fail"}
      label={v === "pass" ? "PROFILE IN BAND" : v === "warn" ? "NEAR LIMIT" : "PROFILE OUT OF BAND"}
    />
  );
}

export function WftVerdictChip({ valueUm }: { valueUm: number | null }) {
  if (valueUm === null) return <StatusChip status="info" label="ENTER WFT µM" />;
  const v = evaluateWftUm(valueUm);
  return (
    <StatusChip
      status={v === "pass" ? "pass" : v === "warn" ? "warn" : "fail"}
      label={v === "pass" ? "WFT IN BAND" : v === "warn" ? "NEAR LIMIT" : "WFT OUT OF BAND"}
    />
  );
}
