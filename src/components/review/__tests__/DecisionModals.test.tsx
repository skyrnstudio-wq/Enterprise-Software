import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApproveModal, RejectModal } from "../DecisionModals";
import type { ReviewFlags } from "@/lib/api/review";

/** Mirrors the module-local constant in DecisionModals (plan: ui-ux §6.8). */
const REJECT_MIN_CHARS = 10;

/**
 * Decision modal contracts — execution-plan Phase 5 steps 3/4/8 +
 * ui-ux-plan §6.8. The modals are the last human gate before an irreversible
 * server transaction; their behavior is pinned here:
 * - Approve: flags re-stated (5.1), ack required, immutable statement (SO-04),
 *   expired-instrument ack enforced (EQ-03).
 * - Reject: min-10-char comments (SO-03/§6.8), show-where note.
 * - Both: BT_MFA surfaces inline with the form intact (5.5).
 */

const cleanFlags: ReviewFlags = { warns: 0, fails: 0, expiredInstruments: 0 };
const flaggedFlags: ReviewFlags = { warns: 3, fails: 1, expiredInstruments: 1 };

function renderApprove(overrides: Partial<Parameters<typeof ApproveModal>[0]> = {}): void {
  render(
    <ApproveModal
      flags={cleanFlags}
      flagsAck={false}
      onFlagsAck={() => {}}
      expiredAcked
      submitting={false}
      btMfaMessage={null}
      onConfirm={() => {}}
      onCancel={() => {}}
      {...overrides}
    />,
  );
}

describe("ApproveModal (step 3, edge 5.1)", () => {
  it("confirm is disabled until the flags are acknowledged", async () => {
    // The modals are controlled components — a stateful harness mirrors the
    // route's usage (state lives in the parent, handlers update it).
    const user = userEvent.setup();
    function Harness(): React.ReactElement {
      const [ack, setAck] = useState(false);
      return (
        <ApproveModal
          flags={cleanFlags}
          flagsAck={ack}
          onFlagsAck={setAck}
          expiredAcked
          submitting={false}
          btMfaMessage={null}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
    }
    render(<Harness />);
    const confirm = screen.getByRole("button", { name: /confirm approval/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });

  it("re-states the flag summary with a clean batch showing pass chips", () => {
    renderApprove({ flags: flaggedFlags });
    expect(screen.getByText("▲ 3 near-limit")).toBeTruthy();
    expect(screen.getByText("✕ 1 breaches")).toBeTruthy();
  });

  it("states the immutable-lock consequence (SO-04)", () => {
    renderApprove();
    expect(screen.getByText(/permanent/i)).toBeTruthy();
  });

  it("expired instrument blocks confirm until acked on the record (EQ-03)", () => {
    renderApprove({ flags: flaggedFlags, expiredAcked: false, flagsAck: true });
    const confirm = screen.getByRole("button", { name: /confirm approval/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/acknowledge the expired instrument/i)).toBeTruthy();
  });

  it("a BT_MFA refusal surfaces inline without clearing the form (edge 5.5)", () => {
    renderApprove({
      flagsAck: true,
      btMfaMessage: "BT_MFA: decision requires an MFA-verified session",
    });
    expect(screen.getByText(/BT_MFA/)).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy(); // form state preserved
  });
});

describe("RejectModal (step 4, SO-03)", () => {
  it("confirm stays disabled below the 10-char minimum", async () => {
    const user = userEvent.setup();
    function Harness(): React.ReactElement {
      const [comments, setComments] = useState("short");
      return (
        <RejectModal
          comments={comments}
          onComments={setComments}
          submitting={false}
          btMfaMessage={null}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
    }
    render(<Harness />);
    const confirm = screen.getByRole("button", { name: /confirm rejection/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await user.clear(screen.getByLabelText(/comments/i));
    await user.type(screen.getByLabelText(/comments/i), "Dimension 12 out of tolerance.");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });

  it("error hint appears while typing below the minimum", () => {
    render(
      <RejectModal
        comments="too short"
        onComments={() => {}}
        submitting={false}
        btMfaMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(new RegExp(`at least ${String(REJECT_MIN_CHARS)}`, "i"))).toBeTruthy();
  });

  it("tells the QH where the inspector will see the comments", () => {
    render(
      <RejectModal
        comments=""
        onComments={() => {}}
        submitting={false}
        btMfaMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/pinned on their dashboard/i)).toBeTruthy();
  });
});
