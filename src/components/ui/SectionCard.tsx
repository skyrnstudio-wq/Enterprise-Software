import type { ReactNode } from "react";
import { Caption } from "./StatusChip";

/**
 * SectionCard — ui-ux-plan §5: paper surface, hairline border, uppercase
 * caption header with the paper format's own section letter (A, B, C…).
 */
export function SectionCard({
  letter,
  title,
  actions,
  children,
  className = "",
}: {
  letter?: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-sm border border-ink-200 bg-paper-raised ${className}`}>
      <header className="flex items-center justify-between gap-4 border-b border-ink-200 px-4 py-2">
        <Caption>
          {letter ? <span className="mr-2 text-ink-700">{letter}</span> : null}
          {title}
        </Caption>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * EmptyState — §5: ink-500 icon + one operational sentence + the single next
 * action as a button. No illustrations, no slogans.
 */
export function EmptyState({
  icon,
  message,
  action,
}: {
  icon: ReactNode;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="text-ink-500">{icon}</div>
      <p className="max-w-md text-sm text-ink-700">{message}</p>
      {action}
    </div>
  );
}
