import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { usePrintGuard } from "@/lib/print";
import { Caption } from "@/components/ui/StatusChip";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

/**
 * Route guard — the layout wraps every post-login screen. The router also
 * threads `context.auth` for `beforeLoad` checks (router.ts); this component
 * handles the render-side redirect + MFA affordance gate (edge 2.14).
 *
 * Print (Phase 6): the whole shell carries `data-app-chrome` so the print
 * stylesheet hides it — a report route renders itself OUTSIDE the chrome
 * (its own overlay), and any other screen hitting Ctrl+P swaps to the
 * blocking notice (report-export-spec §1: only controlled layouts print).
 */
function AuthenticatedLayout() {
  // Report routes render through their own full-screen overlay, not the
  // standard chrome (checked by path — cheap, avoids route matching here).
  const onReportRoute =
    typeof window !== "undefined" && window.location.pathname.startsWith("/reports/");
  const printBlocked = usePrintGuard(onReportRoute);
  const { user, profile, initializing, mfaSatisfied, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!initializing && !user) void navigate({ to: "/login" });
  }, [initializing, user, navigate]);

  if (initializing) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Caption>loading…</Caption>
      </div>
    );
  }

  if (!user) return null;

  const needsMfa = hasRole("QUALITY_HEAD", "ADMIN") && !mfaSatisfied;

  if (printBlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper p-6">
        <div className="max-w-md space-y-2 text-center">
          <p className="text-sm font-medium text-ink-900">
            Printing is reserved for controlled QMS documents.
          </p>
          <p className="text-sm text-ink-700">
            Open an approved batch and use <strong>Export report</strong> to print
            ST/QC/02 or ST/QC/04. Nothing else prints from this platform.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper text-ink-900" data-app-chrome>
      <header className="border-b border-ink-200 bg-paper-raised px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide">
            Simran QC — Inspection Platform
          </span>
          <div className="flex items-center gap-3">
            {profile ? <span className="text-xs text-ink-700">{profile.full_name}</span> : null}
            {needsMfa ? (
              <span className="rounded-xs bg-status-warn-bg px-1.5 py-0.5 text-[11px] font-medium text-status-warn-fg">
                ▲ MFA enrollment required
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        {needsMfa ? (
          <div className="rounded-sm border border-status-warn-fg bg-status-warn-bg p-4 text-sm text-status-warn-fg">
            Your role requires two-factor authentication. Enroll from the profile menu before using
            QH/Admin affordances — approval actions remain blocked server-side until then
            (SO-01…04).
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}
