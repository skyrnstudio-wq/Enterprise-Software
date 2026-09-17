import { Lock } from "lucide-react";
import { Caption } from "./StatusChip";

/**
 * Sign-off Block — ui-ux-plan §5: mirrors the paper format's signature area —
 * name, role/cert (e.g. "NACE CIP Level 2"), timestamp, and hash — visually
 * identical to the PDF's block (report-export-spec.md). Always rendered in
 * the locked treatment: a signed record is immutable (SO-01…04).
 */
export function SignOffBlock({
  role,
  name,
  cert,
  signedAtIso,
  hash,
  pending = false,
}: {
  role: string;
  name: string | null;
  cert?: string | null;
  /** Server timestamp (`now()`), never the client clock (security doc §6). */
  signedAtIso: string | null;
  hash?: string | null;
  /** Pending sign-off (awaiting this role) renders dimmed with no date. */
  pending?: boolean;
}) {
  const dt = signedAtIso
    ? new Date(signedAtIso).toLocaleString("en-IN", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

  return (
    <div className="rounded-sm border border-ink-300 bg-paper-raised px-4 py-3">
      <div className="flex items-center justify-between">
        <Caption>{role}</Caption>
        {pending ? (
          <span className="text-[11px] text-ink-500">pending</span>
        ) : (
          <Lock size={12} className="text-status-locked-fg" aria-label="Signed record" />
        )}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-500">Name</dt>
        <dd className={`font-medium ${pending ? "text-ink-300" : "text-ink-900"}`}>
          {name ?? "—"}
        </dd>
        {cert ? (
          <>
            <dt className="text-ink-500">Certification</dt>
            <dd className="text-ink-700">{cert}</dd>
          </>
        ) : null}
        <dt className="text-ink-500">Signed at</dt>
        <dd className="measurement text-ink-700">{pending ? "—" : dt}</dd>
        {hash ? (
          <>
            <dt className="text-ink-500">Record</dt>
            <dd className="measurement truncate text-xs text-ink-500" title={hash}>
              {hash.slice(0, 12)}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
