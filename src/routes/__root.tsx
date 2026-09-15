import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Root layout — application shell. Sidebar navigation, role-aware header,
 * and offline/sync indicators land here in their respective phases.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-graphite-900">
      <header className="border-b border-graphite-100 bg-paper-raised px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="text-sm font-semibold tracking-wide uppercase">
            Simran QC — Inspection Platform
          </span>
          <span className="text-xs text-graphite-500">
            Skyrn Studio · Phase 0 scaffold
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

export const Route = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
});
