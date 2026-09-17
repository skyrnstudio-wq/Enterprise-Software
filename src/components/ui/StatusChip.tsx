import { Check, TriangleAlert, X, Lock } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The five statuses (ui-ux-plan §4.2/§4.3): every instance = color fill +
 * mandatory glyph + text label. Never animated (§5).
 */
export type ChipStatus = "pass" | "warn" | "fail" | "info" | "locked";

const chipStyles: Record<ChipStatus, { bg: string; fg: string; glyph: ReactNode }> = {
  pass: {
    bg: "bg-status-pass-bg",
    fg: "text-status-pass-fg",
    glyph: <Check size={12} aria-hidden />,
  },
  warn: {
    bg: "bg-status-warn-bg",
    fg: "text-status-warn-fg",
    glyph: <TriangleAlert size={12} aria-hidden />,
  },
  fail: { bg: "bg-status-fail-bg", fg: "text-status-fail-fg", glyph: <X size={12} aria-hidden /> },
  info: {
    bg: "bg-status-info-bg",
    fg: "text-status-info-fg",
    glyph: <span className="text-[11px] leading-none">ƒx</span>,
  },
  locked: {
    bg: "bg-paper-sunken",
    fg: "text-status-locked-fg",
    glyph: <Lock size={12} aria-hidden />,
  },
};

export function StatusChip({
  status,
  label,
  className = "",
}: {
  status: ChipStatus;
  label: string;
  className?: string;
}) {
  const s = chipStyles[status];
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-[11px] font-medium uppercase tracking-[0.06em] ${s.bg} ${s.fg} ${className}`}
    >
      {s.glyph}
      {label}
    </span>
  );
}

/** Caption type (§3.1): 11px, uppercase, +0.06em tracking — section labels. */
export function Caption({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`text-[11px] font-medium uppercase tracking-[0.06em] text-ink-500 ${className}`}
    >
      {children}
    </div>
  );
}
