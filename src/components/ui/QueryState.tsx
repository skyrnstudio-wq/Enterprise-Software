import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";

/**
 * Shared data-state owner — ui-ux-plan §9 three-state contract + §9 a11y.
 * Every data surface renders its loading / error / empty branch THROUGH these
 * components so skeleton shape, error copy, and live-region semantics can
 * never drift per screen (§2.1: one owner per state, not one per route).
 */

/** Layout-shaped loading placeholder (§9 bans text-only "LOADING…"). */
export function Skeleton({ className = "" }: { className?: string }): React.ReactElement {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Table skeleton matching the DataTable header + N body rows. */
export function TableSkeleton({ rows = 5 }: { rows?: number }): React.ReactElement {
  return (
    <div aria-hidden="true" className="rounded-sm border border-ink-200 bg-paper-raised">
      <div className="border-b border-ink-200 bg-paper-sunken px-3 py-2">
        <div className="flex gap-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-ink-100 px-3 py-2.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Cards/panels skeleton — stack of section-card-shaped blocks. */
export function PanelsSkeleton({ count = 2 }: { count?: number }): React.ReactElement {
  return (
    <div aria-hidden="true" className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-sm border border-ink-200 bg-paper-raised p-4">
          <Skeleton className="mb-4 h-3 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface QueryErrorProps {
  title?: string;
  error: unknown;
  onRetry?: (() => void) | undefined;
}

/**
 * Inline error with a recovery path (§9: errors are actionable, never a
 * silent spin or toast-only). `role="alert"` announces it; the message is
 * plain verbs in the platform's voice.
 */
export function QueryError({ title = "Couldn't load this view", error, onRetry }: QueryErrorProps): React.ReactElement {
  const detail =
    error instanceof Error && error.message.trim() !== ""
      ? error.message
      : "The service didn't respond. Check the connection and try again.";
  return (
    <SectionCard title={title} letter="!">
      <div role="alert" aria-live="assertive">
        <p className="text-sm text-ink-700">{detail}</p>
        {onRetry !== undefined ? (
          <Button variant="secondary" className="mt-3" onClick={onRetry}>
            <RotateCcw size={14} className="mr-2 inline" aria-hidden /> Try again
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
}

export interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty?: boolean;
  /** Rendered when `isEmpty` is true and no custom empty UI is supplied. */
  emptyState?: ReactNode;
  onRetry?: (() => void) | undefined;
  /** Layout-shaped skeleton shown while loading. */
  skeleton: ReactNode;
  children: ReactNode;
}

/**
 * Single decision point for the three states. Loading renders the skeleton
 * inside an `aria-live="polite"` + `aria-busy` region; errors upgrade to
 * `role="alert"` inside QueryError; ready renders children only when there is
 * data — partial-data leaks are impossible by construction.
 */
export function QueryState({
  isLoading,
  isError,
  error,
  isEmpty = false,
  emptyState,
  onRetry,
  skeleton,
  children,
}: QueryStateProps): React.ReactElement {
  if (isError) return <QueryError error={error} onRetry={onRetry} />;
  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        {skeleton}
      </div>
    );
  }
  if (isEmpty) return <>{emptyState ?? null}</>;
  return <>{children}</>;
}
