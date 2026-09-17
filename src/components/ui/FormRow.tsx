import type { InputHTMLAttributes, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * FormRow — ui-ux-plan §5: label left (140px), control right; helper text in
 * ink-500; validation text in fail-fg with the ✕-glyph companion (§4.3).
 */
export function FormRow({
  label,
  htmlFor,
  helper,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  helper?: string;
  /** `undefined`-tolerant for direct Zod-issue mapping (EOP-friendly). */
  error?: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <label htmlFor={htmlFor} className="w-[140px] shrink-0 pt-2 text-sm font-medium text-ink-700">
        {label}
      </label>
      <div className="min-w-0 flex-1">
        {children}
        {error ? (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-status-fail-fg">
            <AlertTriangle size={12} aria-hidden /> {error}
          </p>
        ) : helper ? (
          <p className="mt-1 text-xs text-ink-500">{helper}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Text input styled to the token layer (2px radius, hairline border). */
export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 w-full rounded-xs border border-ink-300 bg-paper-raised px-3 text-sm text-ink-900 placeholder:text-ink-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${className}`}
      {...rest}
    />
  );
}
