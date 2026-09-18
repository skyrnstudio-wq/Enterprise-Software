import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryState, QueryError, TableSkeleton } from "../QueryState";

/**
 * Shared state-owner contract — ui-ux-plan §9 three-state rule + §9 a11y:
 * - loading → layout-shaped skeleton inside an aria-live region;
 * - error → role="alert" with a retry affordance;
 * - ready → children, never a partial render;
 * - empty → the caller's empty state.
 */
describe("QueryState (§9 three-state contract)", () => {
  it("renders the skeleton with live-region semantics while loading", () => {
    render(
      <QueryState isLoading isError={false} skeleton={<TableSkeleton rows={2} />}>
        <p>content</p>
      </QueryState>,
    );
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders an alert with retry on error, and retry triggers the callback", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <QueryState
        isLoading={false}
        isError
        error={new Error("fetch failed")}
        onRetry={onRetry}
        skeleton={<TableSkeleton />}
      >
        <p>content</p>
      </QueryState>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("fetch failed");
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders children only when ready", () => {
    render(
      <QueryState isLoading={false} isError={false} skeleton={<TableSkeleton />}>
        <p>content</p>
      </QueryState>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("renders the empty state when marked empty", () => {
    render(
      <QueryState isLoading={false} isError={false} isEmpty skeleton={<TableSkeleton />}>
        <p>content</p>
      </QueryState>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("QueryError summarizes non-Error failures with the generic message", () => {
    render(<QueryError error="weird" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/service didn't respond/i);
  });
});
