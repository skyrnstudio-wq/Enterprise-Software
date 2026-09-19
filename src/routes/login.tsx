import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/auth-context";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/Button";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { Caption } from "@/components/ui/StatusChip";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

/**
 * Standard S1 Login: simple email and password login without MFA/Authenticator.
 */
function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (env.devBypassAuth) void navigate({ to: "/" });
  }, [navigate]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.SyntheticEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signIn(email, password);
      if (res.kind === "error") {
        setError(res.message);
      } else {
        void navigate({ to: "/" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[3fr_2fr]">
      <div className="flex items-center justify-center bg-paper px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-ink-500">
              Inspection Automation &amp; Quality Intelligence Platform
            </p>
          </div>

          <form
            onSubmit={(e) => {
              void onSubmit(e);
            }}
            className="space-y-4"
            noValidate
          >
            {error ? <p className="text-sm font-medium text-status-fail-fg">✕ {error}</p> : null}

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

            <Button type="submit" className="w-full" disabled={busy || !email || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>

            <p className="text-sm text-ink-500">
              Accounts are issued by the platform administrator.{" "}
              <Link to="/signup" className="font-medium text-accent hover:underline">
                Need access?
              </Link>
            </p>
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
