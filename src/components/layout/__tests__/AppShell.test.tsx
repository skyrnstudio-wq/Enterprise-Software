import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "../AppShell";
import type { AppRole } from "@/lib/supabase/database.types";

/**
 * Shell contract (ui-ux-plan §2.1 + §6.0): the nav is a role-filtered task
 * language — inspectors see inspection, QH sees decisions, ADMIN sees master
 * data — and Sunlight Mode (§4.4) persists per workstation. jsdom renders the
 * mobile top bar (viewport < lg); the drawer + desktop rail are exercised in
 * the Playwright layer. `Link` is mocked because router bootstrap is not the
 * subject under test — the shell's role filtering is.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className = "",
    onClick,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <a
      href={to}
      className={className}
      onClick={() => {
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

const shellProps = {
  profile: { id: "u1", full_name: "R Patil", role: "QC_INSPECTOR" as AppRole, mfa_enforced: false },
  mfaSatisfied: true,
  signOut: vi.fn(async () => {}),
};

/** Mirrors AuthProvider's hasRole: ADMIN is superuser, else profile ∈ roles. */
function hasRoleFor(profileRole: AppRole) {
  return (...requested: AppRole[]): boolean => {
    if (profileRole === "ADMIN") return true;
    return requested.includes(profileRole);
  };
}

function renderShell(profileRole: AppRole): void {
  render(
    <AppShell
      {...shellProps}
      profile={{ ...shellProps.profile, role: profileRole }}
      hasRole={hasRoleFor(profileRole)}
    >
      <p>page body</p>
    </AppShell>,
  );
}

describe("AppShell role-filtered nav (§6.0)", () => {
  it("shows the inspector their inspection entries, not review/admin", () => {
    renderShell("QC_INSPECTOR");
    expect(screen.getAllByText("New dimensional").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Review queue")).toHaveLength(0);
    expect(screen.queryAllByText("Item master")).toHaveLength(0);
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("shows QH the review queue, not admin master data", () => {
    renderShell("QUALITY_HEAD");
    expect(screen.getAllByText("Review queue").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Item master")).toHaveLength(0);
  });

  it("shows ADMIN everything", () => {
    renderShell("ADMIN");
    expect(screen.getAllByText("Item master").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Instruments").length).toBeGreaterThan(0);
  });
});

describe("Sunlight Mode toggle (§4.4)", () => {
  it("persists the preference to localStorage and reflects it on <html>", async () => {
    const user = userEvent.setup();
    renderShell("ADMIN");
    const toggle = screen.getByRole("button", { name: /toggle sunlight mode/i });
    expect(document.documentElement.hasAttribute("data-sunlight")).toBe(false);
    await user.click(toggle);
    expect(document.documentElement.hasAttribute("data-sunlight")).toBe(true);
    expect(window.localStorage.getItem("sunlight")).toBe("1");
    await user.click(toggle);
    expect(document.documentElement.hasAttribute("data-sunlight")).toBe(false);
    expect(window.localStorage.getItem("sunlight")).toBe("0");
  });
});
