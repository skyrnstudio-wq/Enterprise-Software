import type { ReactNode } from "react";
import { Caption } from "./StatusChip";

/**
 * CompliancePanel — ui-ux-plan §5 + §7.2: `bg-sunken` panel, mono figures,
 * `ƒx AUTO-CALC` tag, one big readout. The result is the hero, not the form.
 * The whole unit takes the fail treatment when a compliance gate trips.
 */
export function CompliancePanel({
  title,
  tag = "AUTO-CALC",
  readout,
  unit,
  note,
  status = "info",
  children,
}: {
  title: string;
  tag?: string;
  /** The big mono figure — e.g. the ΔT readout. */
  readout: string;
  unit?: string;
  note?: string;
  /** Fail flips the entire panel to the fail treatment (§5). */
  status?: "info" | "fail" | "pass" | "warn";
  children?: ReactNode;
}) {
  const panel =
    status === "fail"
      ? "bg-status-fail-bg border-status-fail-fg"
      : status === "pass"
        ? "bg-status-pass-bg border-status-pass-fg"
        : status === "warn"
          ? "bg-status-warn-bg border-status-warn-fg"
          : "bg-paper-sunken border-ink-200";
  const fg =
    status === "fail"
      ? "text-status-fail-fg"
      : status === "pass"
        ? "text-status-pass-fg"
        : status === "warn"
          ? "text-status-warn-fg"
          : "text-ink-900";
  const info = status === "info" ? "text-status-info-fg" : fg;

  return (
    <div className={`rounded-sm border p-4 ${panel}`}>
      <div className="flex items-center justify-between">
        <Caption className={info}>{title}</Caption>
        <span
          className={`inline-flex items-center gap-1 rounded-xs bg-paper-raised px-1.5 py-0.5 text-[11px] font-medium ${info}`}
        >
          ƒx {tag}
        </span>
      </div>
      <div className={`measurement mt-2 text-4xl font-medium tracking-tight ${fg}`}>
        {readout}
        {unit ? <span className="ml-1 text-lg">{unit}</span> : null}
      </div>
      {note ? <p className={`mt-1 text-xs ${info}`}>{note}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * WizardRail — §5: vertical step indicator — filled dot = done, ring =
 * current, dim = pending; names use the paper format's section names.
 */
export function WizardRail({
  steps,
  current,
  onStepClick,
}: {
  steps: string[];
  current: number;
  onStepClick?: (index: number) => void;
}) {
  return (
    <ol className="flex flex-col gap-1" aria-label="Progress">
      {steps.map((name, i) => {
        const state = i < current ? "done" : i === current ? "current" : "pending";
        const clickable = onStepClick !== undefined && (i < current || i === current);
        return (
          <li key={name}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick?.(i)}
              className={`flex w-full items-center gap-3 rounded-xs px-2 py-2 text-left text-sm ${
                state === "current" ? "bg-paper-sunken font-medium text-ink-900" : "text-ink-500"
              } ${clickable ? "hover:bg-paper-sunken" : "cursor-default"}`}
            >
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  state === "done"
                    ? "border-accent bg-accent"
                    : state === "current"
                      ? "border-accent bg-paper-raised"
                      : "border-ink-300 bg-transparent"
                }`}
              />
              <span className="min-w-0 truncate">{name}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
