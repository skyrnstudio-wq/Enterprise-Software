import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/Button";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { Caption } from "@/components/ui/StatusChip";

/**
 * MFA (TOTP) enrollment dialog — execution-plan edge 2.14's UI half.
 *
 * `decide_batch` hard-requires an AAL2 session (migration 005, fail-closed),
 * so a QUALITY_HEAD / ADMIN without a verified factor could never sign a
 * batch. The enrollment machinery already existed in AuthProvider
 * (`enrollMfa` → QR + secret, `confirmMfaEnrollment`) — this dialog is the
 * missing front door, reached from the AppShell identity block.
 *
 * Flow: enroll → scan QR (or type the secret) into any authenticator →
 * confirm a 6-digit code → `refreshFactors` marks mfaSatisfied without a
 * re-login. Until a verified factor exists, QH/Admin affordances stay
 * blocked server-side — enrolling here is the only way through.
 */
export function MfaEnrollDialog({
  open,
  onOpenChange,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a factor is verified — lets the shell refresh factors. */
  onEnrolled: () => void;
}): React.ReactElement {
  const { enrollMfa, confirmMfaEnrollment } = useAuth();
  const [enrollment, setEnrollment] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEnrollment(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await enrollMfa();
    if (res.kind === "enrolled") setEnrollment({ qr: res.qr, secret: res.secret });
    else setError(res.message);
    setBusy(false);
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await confirmMfaEnrollment(code.replace(/\s+/g, ""));
    if (res.kind === "ok") {
      setEnrollment(null);
      setCode("");
      onEnrolled();
      onOpenChange(false);
    } else {
      setError(res.message);
    }
    setBusy(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-ink-300 bg-paper-raised p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
        >
          <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck size={16} aria-hidden /> Set up two-factor authentication
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <p className="mt-1 text-sm text-ink-700">
              Sign-off decisions require an authenticator app (TOTP). Your identity is what makes
              the digital signature auditable (SO-01…04).
            </p>
          </DialogPrimitive.Description>

          {enrollment === null ? (
            <div className="mt-4">
              <Button onClick={() => void startEnrollment()} disabled={busy} className="w-full">
                {busy ? "Generating…" : "Begin enrollment"}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-4">
                {/* The QR is a data URL from Supabase; an <img> is the only way
                    to show it. Fallback: type the secret manually. */}
                <img
                  src={enrollment.qr}
                  alt="Authenticator QR code"
                  className="h-36 w-36 shrink-0 rounded-sm border border-ink-200 bg-white p-1"
                />
                <div className="min-w-0 text-xs text-ink-700">
                  <p className="font-medium">1. Scan with your authenticator</p>
                  <p className="mt-1 text-ink-500">No camera? Enter this key manually:</p>
                  <code className="measurement mt-1 block break-all rounded-xs bg-paper-sunken px-2 py-1 text-[11px]">
                    {enrollment.secret}
                  </code>
                </div>
              </div>
              <FormRow
                label="Verification code"
                htmlFor="mfa-confirm"
                helper="6 digits from the authenticator entry for this platform"
                error={error}
              >
                <TextInput
                  id="mfa-confirm"
                  className="measurement tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                  }}
                  autoFocus
                />
              </FormRow>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEnrollment(null);
                    setError(null);
                  }}
                >
                  Back
                </Button>
                <Button onClick={() => void confirm()} disabled={busy || code.trim().length !== 6}>
                  {busy ? "Verifying…" : "Verify & enable"}
                </Button>
              </div>
            </div>
          )}
          {enrollment === null && error !== null ? (
            <p className="mt-3 text-sm font-medium text-status-fail-fg">✕ {error}</p>
          ) : null}
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="absolute top-3 right-3 text-ink-500 hover:text-ink-900"
            >
              ✕
            </button>
          </DialogPrimitive.Close>
          <Caption className="mt-4">Issuer: Simran QC Platform · TOTP · SHA-1 · 6 digits</Caption>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
