import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/Button";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { Caption } from "@/components/ui/StatusChip";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

/**
 * S1 Login (ui-ux-plan §6.1): split layout — left 60% paper form, right 40%
 * graphite panel with controlled-format numbers as a mono list. Inline error
 * states, never alerts. Role routing happens silently post-auth — no role
 * picker. MFA-enrolled users get the TOTP step inline.
 */
function LoginPage() {
  const { signIn, verifyMfa } = useAuth();
  const navigate = useNavigate();

  // Dev bypass: /login forwards to the dashboard (AuthProvider carries the
  // synthetic session). A real deployment never sets the flag, so this
  // screen is always the front door in staging/production.
  useEffect(() => {
    if (env.devBypassAuth) void navigate({ to: "/" });
  }, [navigate]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set only once auth has FULLY succeeded (past any TOTP step) — the login
  // screen owns this redirect so an MFA user is never bounced to the shell
  // mid-challenge. Guard on a local flag, not `user`, because the session is
  // established at aal1 before the TOTP challenge completes.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (signedIn) void navigate({ to: "/" });
  }, [signedIn, navigate]);

  async function onSubmit(e: React.SyntheticEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (factorId) {
        const res = await verifyMfa(factorId, totp);
        if (res.kind === "error") setError(res.message);
        else {
          setFactorId(null);
          setSignedIn(true);
        }
      } else {
        const res = await signIn(email, password);
        if (res.kind === "error") setError(res.message);
        else if (res.kind === "mfa-required") setFactorId(res.factorId);
        else setSignedIn(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const controls = factorId ? (
    <div className="space-y-4">
      <FormRow
        label="Authenticator code"
        htmlFor="totp"
        helper="6-digit code from your authenticator app"
      >
        <TextInput
          id="totp"
          className="measurement tracking-[0.3em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={totp}
          onChange={(e) => {
            setTotp(e.target.value);
          }}
          autoFocus
        />
      </FormRow>
      <Button type="submit" className="w-full" disabled={busy || totp.trim().length !== 6}>
        <ShieldCheck size={16} className="mr-2 inline" /> Verify & sign in
      </Button>
    </div>
  ) : (
    <div className="space-y-4">
      <FormRow label="Email" htmlFor="email" helper="Company email address">
        <TextInput
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          autoFocus
        />
      </FormRow>
      <FormRow label="Password" htmlFor="password">
        <TextInput
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </FormRow>
      {error ? <p className="text-sm font-medium text-status-fail-fg">✕ {error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy || !email || !password}>
        Sign in
      </Button>
    </div>
  );

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[3fr_2fr]">
      <div className="flex items-center justify-center bg-paper px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-ink-500">
              Inspection Automation & Quality Intelligence Platform
            </p>
          </div>
          <form
            onSubmit={(e) => {
              void onSubmit(e);
            }}
            className="space-y-4"
            noValidate
          >
            {factorId ? (
              error ? (
                <p className="text-sm font-medium text-status-fail-fg">✕ {error}</p>
              ) : null
            ) : null}
            {controls}
            {factorId === null ? (
              <p className="text-sm text-ink-500">
                Accounts are issued by the platform administrator.{" "}
                <Link to="/signup" className="font-medium text-accent hover:underline">
                  Need access?
                </Link>
              </p>
            ) : null}
          </form>
        </div>
      </div>
      <aside className="hidden flex-col justify-center bg-graphite-900 px-10 lg:flex">
        <p className="text-lg font-semibold text-paper-raised">Simran Technocrats</p>
        <Caption className="mt-1">Inspection Platform</Caption>
        <ul className="measurement mt-8 space-y-1 text-xs text-graphite-300">
          <li>ST/QC/02 — Dimensional Inspection Record</li>
          <li>ST/QC/04 — Coating Inspection Record</li>
          <li>ISO 12944-7 · ISO 19840 · NACE CIP L2</li>
        </ul>
      </aside>
    </div>
  );
}
