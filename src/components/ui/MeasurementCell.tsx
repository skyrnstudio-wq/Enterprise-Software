import { useMemo, useRef } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { evaluateTolerance } from "@/domain/measurement";

/**
 * MeasurementCell — the atom of the product (ui-ux-plan §5).
 *
 * - Uncontrolled input: only this cell re-renders per keystroke (the value
 *   lives in the DOM until blur/commit); the grid never re-renders on typing.
 * - Live validation per §4.3: status fill + glyph + thickened 3px left border
 *   in the status color — a redundant encoding that survives monochrome
 *   printing and colorblind reading alike.
 * - Mono type, right-aligned, tabular figures, 48px tall.
 */

export type CellStatus = "empty" | "pass" | "warn" | "fail";

interface Props {
  nominal: number;
  tolPlus: number;
  tolMinus: number;
  /** Committed value (controlled side); the DOM owns the in-flight text. */
  value: number | null;
  onCommit: (value: number | null) => void;
  disabled?: boolean;
  ariaLabel: string;
  /**
   * Grid navigation hook (DIM-03). When provided, Enter/Tab/arrow keys are
   * delegated to the grid's focus model instead of the standalone blur
   * behavior; the grid moves focus and commits explicitly.
   */
  onNavigate?: (
    key: "Tab" | "Shift+Tab" | "Enter" | "ArrowDown" | "ArrowRight" | "ArrowLeft",
  ) => void;
  /** Stable DOM hook for grid focus management / double-tap (data-cell). */
  cellId?: string;
  /** Grid registers the input element under `cellId` for programmatic focus. */
  registerRef?: (key: string, el: HTMLInputElement | null) => void;
  /**
   * Multi-value paste hook (edge 3.8). Return true when the paste was
   * consumed (e.g. 5 values split across the row) to suppress the default.
   */
  onPaste?: (text: string) => boolean;
}

export function MeasurementCell({
  nominal,
  tolPlus,
  tolMinus,
  value,
  onCommit,
  disabled,
  ariaLabel,
  onNavigate,
  cellId,
  registerRef,
  onPaste,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Evaluate the committed value, not the in-flight text.
  const status: CellStatus = useMemo(() => {
    if (value === null) return "empty";
    return evaluateTolerance(value, nominal - tolMinus, nominal + tolPlus); // "pass" | "warn" | "fail"
  }, [value, nominal, tolMinus, tolPlus]);

  const fill =
    status === "pass"
      ? "bg-status-pass-bg"
      : status === "warn"
        ? "bg-status-warn-bg"
        : status === "fail"
          ? "bg-status-fail-bg"
          : "bg-paper-raised";
  const leftBorder =
    status === "pass"
      ? "border-l-status-pass-fg"
      : status === "warn"
        ? "border-l-status-warn-fg"
        : status === "fail"
          ? "border-l-status-fail-fg"
          : "border-l-ink-300";

  const glyph =
    status === "pass" ? (
      <Check size={12} className="text-status-pass-fg" aria-hidden />
    ) : status === "warn" ? (
      <TriangleAlert size={12} className="text-status-warn-fg" aria-hidden />
    ) : status === "fail" ? (
      <X size={12} className="text-status-fail-fg" aria-hidden />
    ) : null;

  return (
    <div
      className={`relative flex h-12 items-center rounded-xs border border-ink-300 border-l-[3px] ${fill} ${leftBorder}`}
    >
      <input
        ref={(el) => {
          inputRef.current = el;
          if (cellId !== undefined) registerRef?.(cellId, el);
        }}
        inputMode="decimal"
        disabled={disabled}
        aria-label={ariaLabel}
        data-cell={cellId}
        onPaste={(e) => {
          if (onPaste === undefined) return;
          const text = e.clipboardData.getData("text");
          if (onPaste(text)) e.preventDefault();
        }}
        onDoubleClick={() => {
          // Edge 3.18: tablets without an Enter key — double-tap moves down.
          if (onNavigate !== undefined) onNavigate("Enter");
        }}
        defaultValue={value === null ? "" : String(value)}
        key={value === null ? "empty" : value}
        onBlur={(e) => {
          const raw = e.target.value.trim().replace(",", ".");
          if (raw === "") {
            onCommit(null);
            return;
          }
          const n = Number(raw);
          onCommit(Number.isFinite(n) ? n : null);
        }}
        onKeyDown={(e) => {
          if (onNavigate !== undefined) {
            const navKey =
              e.key === "Tab" && e.shiftKey
                ? ("Shift+Tab" as const)
                : e.key === "Enter"
                  ? ("Enter" as const)
                  : e.key === "Tab"
                    ? ("Tab" as const)
                    : e.key === "ArrowDown"
                      ? ("ArrowDown" as const)
                      : e.key === "ArrowRight"
                        ? ("ArrowRight" as const)
                        : e.key === "ArrowLeft"
                          ? ("ArrowLeft" as const)
                          : null;
            if (navKey !== null) {
              e.preventDefault();
              onNavigate(navKey);
            }
            return;
          }
          if (e.key === "Enter") {
            (
              e.currentTarget.form?.querySelectorAll<HTMLInputElement>("input[data-cell]")[0] ??
              e.currentTarget
            ).blur();
            e.preventDefault();
          }
        }}
        className="measurement h-full w-full bg-transparent pr-6 pl-2 text-right text-sm text-ink-900 outline-none"
      />
      <span className="pointer-events-none absolute right-2 flex items-center">{glyph}</span>
    </div>
  );
}

/** `ƒx` tag — marks an auto-computed value (§3.3 symbol set). */
export function FxTag({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-xs bg-status-info-bg px-1.5 py-0.5 text-[11px] font-medium text-status-info-fg">
      ƒx {label}
    </span>
  );
}
