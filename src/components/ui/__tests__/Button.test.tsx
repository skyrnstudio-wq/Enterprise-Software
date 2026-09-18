import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../Button";

/**
 * Touch + layout contract (ui-ux-plan §8.2): 44px minimum hit height, labels
 * never wrap (the audit caught wrapped labels escaping the 36px box), inline
 * centering for icon+label pairs.
 */
describe("Button touch contract (§8.2)", () => {
  it("meets the 44px minimum height", () => {
    render(<Button>New dimensional batch</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("whitespace-nowrap");
  });

  it("centers icon+label content", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button").className).toContain("inline-flex");
  });

  it("long labels stay single-line, not wrapped", () => {
    render(<Button>Approve &amp; Sign</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).not.toMatch(/whitespace-normal/);
  });
});
