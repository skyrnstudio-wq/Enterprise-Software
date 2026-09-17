import { Button } from "@/components/ui/Button";
import { FormRow } from "@/components/ui/FormRow";
import { StatusChip } from "@/components/ui/StatusChip";
import type { ReviewFlags } from "@/lib/api/review";

/**
 * Decision modals (S16/S17 action-bar contracts) — execution-plan Phase 5
 * steps 3/4 + ui-ux-plan §6.8, extracted from the review route so the modal
 * contracts are component-testable:
 * - Approve (5.1): re-states the flag summary; QH must acknowledge the flags
 *   before Confirm; states the immutable-lock consequence (SO-04).
 * - Reject (SO-03): mandatory comments, plan minimum 10 chars; tells the QH
 *   where the inspector will see them.
 */

/** Plan minimum for rejection comments (ui-ux §6.8). Module-local so this
 * file stays component-only (react-refresh). */
const REJECT_MIN_CHARS = 10;

export function ApproveModal({
  flags,
  flagsAck,
  onFlagsAck,
  expiredAcked,
  submitting,
  btMfaMessage,
  onConfirm,
  onCancel,
}: {
  flags: ReviewFlags;
  flagsAck: boolean;
  onFlagsAck: (v: boolean) => void;
  /** EQ-03 ack already completed on the record (expired instrument). */
  expiredAcked: boolean;
  submitting: boolean;
  /** Non-null ⇒ the server demanded AAL2 — shown, form preserved (5.5). */
  btMfaMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const needsExpiredAck = flags.expiredInstruments > 0 && !expiredAcked;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-sm border border-ink-300 bg-paper-raised p-5">
        <h2 className="text-base font-semibold">Approve &amp; sign</h2>
        <p className="mt-2 text-sm text-ink-700">
          Approval is <strong>permanent</strong>: the record becomes immutable, the sign-off
          timestamp is server-side, and no edit is possible thereafter (SO-04).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusChip status="warn" label={`▲ ${String(flags.warns)} near-limit`} />
          <StatusChip
            status={flags.fails > 0 ? "fail" : "pass"}
            label={`✕ ${String(flags.fails)} breaches`}
          />
          {flags.expiredInstruments > 0 ? (
            <StatusChip status="fail" label="expired instrument" />
          ) : null}
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-ink-900">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={flagsAck}
            onChange={(e) => {
              onFlagsAck(e.target.checked);
            }}
          />
          I have reviewed the {String(flags.warns + flags.fails)} flagged item(s) above (edge 5.1).
        </label>
        {needsExpiredAck ? (
          <p className="mt-2 text-xs font-medium text-status-fail-fg">
            ✕ Acknowledge the expired instrument on the record first (EQ-03).
          </p>
        ) : null}
        {btMfaMessage !== null ? (
          <p className="mt-2 text-xs font-medium text-status-fail-fg">{btMfaMessage}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!flagsAck || needsExpiredAck || submitting} onClick={onConfirm}>
            Confirm approval
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RejectModal({
  comments,
  onComments,
  submitting,
  btMfaMessage,
  onConfirm,
  onCancel,
}: {
  comments: string;
  onComments: (v: string) => void;
  submitting: boolean;
  btMfaMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tooShort = comments.trim().length < REJECT_MIN_CHARS;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-sm border border-ink-300 bg-paper-raised p-5">
        <h2 className="text-base font-semibold">Return to inspector</h2>
        <FormRow
          label="Comments"
          htmlFor="rej-comments"
          helper="Minimum 10 characters — these print on the report and are shown on the inspector's dashboard."
          error={
            comments.trim().length > 0 && tooShort
              ? `At least ${String(REJECT_MIN_CHARS)} characters required.`
              : null
          }
        >
          <textarea
            id="rej-comments"
            className="min-h-[96px] w-full rounded-xs border border-ink-300 bg-paper-raised px-2 py-2 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            value={comments}
            onChange={(e) => {
              onComments(e.target.value);
            }}
          />
        </FormRow>
        <p className="mt-2 text-xs text-ink-500">
          The inspector sees these comments pinned on their dashboard next to the batch (newlines
          and long text render safely).
        </p>
        {btMfaMessage !== null ? (
          <p className="mt-2 text-xs font-medium text-status-fail-fg">{btMfaMessage}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={tooShort || submitting} onClick={onConfirm}>
            Confirm rejection
          </Button>
        </div>
      </div>
    </div>
  );
}
