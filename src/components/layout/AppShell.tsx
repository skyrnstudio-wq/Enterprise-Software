import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MfaEnrollDialog } from "@/components/auth/MfaEnrollDialog";
import {
  LayoutDashboard,
  ClipboardList,
  Scale,
  Package,
  Wrench,
  Sun,
  Moon,
  Search,
  Menu,
  X,
} from "lucide-react";
import type { Profile } from "@/lib/auth/auth-types";
import type { AppRole } from "@/lib/supabase/database.types";
import { Caption } from "@/components/ui/StatusChip";

/**
 * App shell — ui-ux-plan §2.1: side nav (primary, collapsible) + top bar
 * with ⌘K batch search and notifications. Replaces the single-line header
 * hack that overflowed every tablet viewport (§8.1: tablets are the primary
 * device). The nav filters by role so each persona sees one task language
 * (§6.0): inspection for inspectors, decisions for QH, master data for ADMIN.
 *
 * Print contract: the root carries `data-app-chrome` — the @media print layer
 * hides the whole shell, so reports printed from a report route are unaffected.
 */

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Extra roles beyond the implicit owner; ADMIN sees everything. */
  roles?: AppRole[];
  /** Inspector-owned by default; QH/Admin also get a read view. */
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard size={16} aria-hidden /> },
  {
    to: "/batch/new",
    label: "New dimensional",
    icon: <ClipboardList size={16} aria-hidden />,
    ownerOnly: true,
  },
  {
    to: "/coating/new",
    label: "New coating",
    icon: <Wrench size={16} aria-hidden />,
    ownerOnly: true,
  },
  {
    to: "/review",
    label: "Review queue",
    icon: <Scale size={16} aria-hidden />,
    roles: ["QUALITY_HEAD"],
  },
  { to: "/admin/items", label: "Item master", icon: <Package size={16} aria-hidden />, roles: ["ADMIN"] },
  {
    to: "/admin/instruments",
    label: "Instruments",
    icon: <Wrench size={16} aria-hidden />,
    roles: ["ADMIN"],
  },
];

function navFor(hasRole: (...roles: AppRole[]) => boolean): NavItem[] {
  return NAV.filter((item) => {
    if (item.roles !== undefined) return hasRole("ADMIN", ...item.roles);
    return item.ownerOnly === true ? hasRole("ADMIN", "QC_INSPECTOR") : true;
  });
}

/** Shared side-nav column — also renders inside the mobile drawer. */
function NavColumn({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}): React.ReactElement {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm text-ink-700 hover:bg-paper-sunken hover:text-ink-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&.active]:bg-paper-sunken [&.active]:font-semibold [&.active]:text-ink-900"
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Sunlight Mode toggle (§4.4) — flips `data-sunlight` on <html>; the token
 * overrides live in index.css. Persisted per workstation (localStorage), the
 * same offline-first storage the drafts use.
 */
function useSunlight(): [boolean, () => void] {
  const [on, setOn] = useState(() =>
    typeof window === "undefined" ? false : window.localStorage.getItem("sunlight") === "1",
  );
  useEffect(() => {
    if (on) document.documentElement.setAttribute("data-sunlight", "");
    else document.documentElement.removeAttribute("data-sunlight");
    window.localStorage.setItem("sunlight", on ? "1" : "0");
  }, [on]);
  return [on, () => { setOn((v) => !v); }];
}

function SunlightToggle({ className = "" }: { className?: string }): React.ReactElement {
  const [on, flip] = useSunlight();
  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={on}
      title={on ? "Sunlight mode on — high contrast for shop-floor glare" : "Enable Sunlight Mode"}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-sm border border-transparent text-ink-700 hover:bg-paper-sunken hover:text-ink-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {on ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
      <span className="sr-only">Toggle Sunlight Mode</span>
    </button>
  );
}

export interface AppShellProps {
  profile: Profile | null;
  hasRole: (...roles: AppRole[]) => boolean;
  mfaSatisfied: boolean;
  signOut: () => Promise<void>;
  onOpenSearch?: (() => void) | undefined;
  children: ReactNode;
}

export function AppShell({
  profile,
  hasRole,
  mfaSatisfied,
  signOut,
  onOpenSearch,
  children,
}: AppShellProps): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const items = navFor(hasRole);

  const identity = (
    <div className="mt-auto border-t border-ink-200 p-3">
      <div className="sunlight-muted truncate text-sm font-medium">{profile?.full_name ?? "—"}</div>
      <Caption className="sunlight-muted">{profile?.role ?? "—"}</Caption>
      {needsMfa(mfaSatisfied, hasRole) ? (
        <button
          type="button"
          onClick={() => {
            setEnrollOpen(true);
          }}
          className="mt-1 block text-left text-[11px] font-medium text-status-warn-fg underline underline-offset-2 hover:text-status-warn-fg/80"
        >
          ▲ MFA enrollment required — set up now
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          void signOut();
        }}
        className="mt-2 text-xs font-medium text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-paper text-ink-900" data-app-chrome>
      {/* ————————————————————————— Mobile top bar ————————————————————————— */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-200 bg-paper-raised px-4 py-2 lg:hidden">
        <Link to="/" className="text-sm font-semibold uppercase tracking-wide">
          Simran QC
        </Link>
        <div className="flex items-center">
          <SunlightToggle />
          {onOpenSearch !== undefined ? (
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Search batches"
              className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-ink-700 hover:bg-paper-sunken hover:text-ink-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <Search size={16} aria-hidden />
            </button>
          ) : null}
          <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DialogPrimitive.Trigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-ink-700 hover:bg-paper-sunken hover:text-ink-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <Menu size={18} aria-hidden />
              </button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-graphite-900/40" />
              <DialogPrimitive.Content
                aria-label="Menu"
                className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-ink-200 bg-paper-raised p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <DialogPrimitive.Title className="text-sm font-semibold uppercase tracking-wide">
                    Menu
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      aria-label="Close menu"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-ink-700 hover:bg-paper-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </DialogPrimitive.Close>
                </div>
                <NavColumn items={items} onNavigate={() => { setDrawerOpen(false); }} />
                {identity}
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </header>

      <div className="flex min-h-dvh">
        {/* ———————————————————————— Desktop side nav ———————————————————————— */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-200 bg-paper-raised lg:flex">
          <Link
            to="/"
            className="border-b border-ink-200 px-4 py-3 text-sm font-semibold uppercase tracking-wide hover:text-ink-700"
          >
            Simran QC — Inspection Platform
          </Link>
          <div className="flex-1 overflow-y-auto p-3">
            <NavColumn items={items} />
          </div>
          {identity}
        </aside>

        {/* —————————————————————————— Content ——————————————————————————— */}
        <div className="min-w-0 flex-1">
          {needsMfa(mfaSatisfied, hasRole) ? (
            <div className="border-b border-status-warn-fg bg-status-warn-bg px-4 py-2 text-sm text-status-warn-fg lg:px-8">
              <span>
                Your role requires two-factor authentication. Enroll now — approval actions remain
                blocked server-side until then (SO-01…04).
              </span>
              <button
                type="button"
                onClick={() => {
                  setEnrollOpen(true);
                }}
                className="ml-1 font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                Set up MFA →
              </button>
            </div>
          ) : null}
          <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
      {enrollOpen ? (
        <MfaEnrollDialog
          open
          onOpenChange={setEnrollOpen}
          onEnrolled={() => { window.location.reload(); }}
        />
      ) : null}
    </div>
  );
}

function needsMfa(mfaSatisfied: boolean, hasRole: (...roles: AppRole[]) => boolean): boolean {
  return hasRole("QUALITY_HEAD", "ADMIN") && !mfaSatisfied;
}
