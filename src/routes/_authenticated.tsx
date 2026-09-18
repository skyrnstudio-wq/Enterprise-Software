import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/auth-context";
import { env } from "@/lib/env";
import { usePrintGuard } from "@/lib/print";
import { AppShell } from "@/components/layout/AppShell";
import { BatchSearchDialog } from "@/components/search/BatchSearchDialog";
import { Skeleton } from "@/components/ui/QueryState";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

/**
 * Route guard + shell host. The layout wraps every post-login screen and owns
 * three cross-cutting concerns (ui-ux-plan §2.1):
 * - the AppShell (side nav per role, Sunlight toggle, identity/sign-out);
 * - the ⌘K batch-search palette;
 * - the print guard (only controlled report layouts may print).
 */
function AuthenticatedLayout() {
  // Report routes render through their own full-screen overlay, not the
  // standard chrome (checked by path — cheap, avoids route matching here).
  const onReportRoute =
    typeof window !== "undefined" && window.location.pathname.startsWith("/reports/");
  const printBlocked = usePrintGuard(onReportRoute);
  const { user, profile, initializing, mfaSatisfied, hasRole, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  // Session resolution failed → the login screen. (Dev bypass keeps a
  // synthetic user, so /login stays reachable only when it's off.)
  useEffect(() => {
    if (!initializing && user === null) void navigate({ to: "/login" });
  }, [initializing, user, navigate]);

  // ⌘K / Ctrl+K toggles batch search from anywhere in the shell.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); };
  }, []);

  if (initializing) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper" aria-busy="true">
        <div className="w-64 space-y-2" aria-live="polite">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (user === null) return null;

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
    <>
      <AppShell
        profile={profile}
        hasRole={hasRole}
        mfaSatisfied={mfaSatisfied}
        signOut={signOut}
        onOpenSearch={() => {
          setSearchOpen(true);
        }}
      >
        {env.devBypassAuth ? (
          <div className="mb-4">
            <span className="rounded-xs bg-ink-100 px-2 py-0.5 text-[11px] font-mono text-ink-700">
              Dev Mode (No Login)
            </span>
          </div>
        ) : null}
        <Outlet />
      </AppShell>
      <BatchSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
