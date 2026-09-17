import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button — ui-ux-plan §3.2/§4.1. Radii 4px, safety-orange primary used
 * sparingly; secondary is hairline; destructive uses fail tokens.
 */
type Variant = "primary" | "secondary" | "destructive" | "ghost";

const styles: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover border border-accent",
  secondary: "bg-paper-raised text-ink-900 border border-ink-300 hover:bg-paper-sunken",
  destructive:
    "bg-status-fail-bg text-status-fail-fg border border-status-fail-fg hover:brightness-95",
  ghost: "text-ink-700 border border-transparent hover:bg-paper-sunken",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={`h-9 rounded-sm px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
