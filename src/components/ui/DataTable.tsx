import type { ReactElement, ReactNode } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { Caption } from "./StatusChip";

/**
 * DataTable — ui-ux-plan §5: sunken caption-type header, 8px cell padding,
 * sticky header + first column, zebra-free (borders only). Wrapped in a
 * scroll container so sticky positioning works inside dense pages.
 */
export function DataTable({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-auto rounded-sm border border-ink-200 bg-paper-raised ${className}`}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-paper-sunken">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  sticky,
  mono,
  className = "",
}: {
  children: ReactNode;
  /** First column: also sticky horizontally. */
  sticky?: boolean;
  /** Measurement type — tabular figures for numeric columns (§3.3). */
  mono?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-ink-300 px-2 py-2 text-left first:pl-3 last:pr-3 ${
        sticky ? "sticky left-0 z-20 bg-paper-sunken" : ""
      } ${mono ? "measurement" : ""} ${className}`}
    >
      <Caption>{children}</Caption>
    </th>
  );
}

export function TR({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <tr className={`border-b border-ink-200 hover:bg-paper-sunken/50 ${className}`}>{children}</tr>
  );
}

export function TD({
  children,
  sticky,
  mono,
  className = "",
}: {
  children: ReactNode;
  sticky?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-2 py-2 align-middle first:pl-3 last:pr-3 ${sticky ? "sticky left-0 z-10 bg-paper-raised" : ""} ${mono ? "measurement" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * Toast — §5: top-right, Level-1 elevation, auto-dismiss 6s. Compliance
 * failures pass `persist` so the toast stays until acknowledged.
 */
const toastViewport =
  "fixed top-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none";

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider duration={6_000} swipeDirection="right">
      {children}
      <ToastPrimitive.Viewport className={toastViewport} />
    </ToastPrimitive.Provider>
  );
}

export function Toast({
  open,
  onOpenChange,
  title,
  description,
  persist = false,
  status = "info",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Compliance failures persist until acknowledged (§5). */
  persist?: boolean;
  status?: "info" | "warn" | "fail" | "pass";
}): ReactElement {
  const accent: Record<"info" | "warn" | "fail" | "pass", string> = {
    info: "border-l-ink-500",
    pass: "border-l-status-pass-fg",
    warn: "border-l-status-warn-fg",
    fail: "border-l-status-fail-fg",
  };
  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      {...(persist ? { duration: Infinity } : {})}
      className={`rounded-sm border border-ink-200 border-l-4 bg-paper-raised px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.14)] ${accent[status]}`}
    >
      <ToastPrimitive.Title className="text-sm font-medium text-ink-900">
        {title}
      </ToastPrimitive.Title>
      {description ? (
        <ToastPrimitive.Description className="mt-0.5 text-xs text-ink-700">
          {description}
        </ToastPrimitive.Description>
      ) : null}
    </ToastPrimitive.Root>
  );
}
