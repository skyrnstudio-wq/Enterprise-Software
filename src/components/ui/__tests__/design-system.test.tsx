import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wrench } from "lucide-react";
import { Button } from "../Button";
import { FormRow, TextInput } from "../FormRow";
import { StatusChip, Caption } from "../StatusChip";
import { SectionCard, EmptyState } from "../SectionCard";
import { DataTable, THead, TH, TR, TD, ToastProvider, Toast } from "../DataTable";
import { MeasurementCell, FxTag } from "../MeasurementCell";
import { CompliancePanel, WizardRail } from "../CompliancePanel";
import { SignOffBlock } from "../SignOffBlock";

/** jsdom lacks ResizeObserver, which Radix primitives use. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = ResizeObserverStub;
}

describe("Button (§3.2/§4.1)", () => {
  it("defaults to the safety-orange primary and supports variants", () => {
    const { rerender } = render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).className).toContain("bg-accent");
    rerender(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-status-fail-bg");
    rerender(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("FormRow (§5)", () => {
  it("associates the label and shows helper text", () => {
    render(
      <FormRow label="Instrument" htmlFor="inst" helper="Select the calibrated instrument">
        <TextInput id="inst" />
      </FormRow>,
    );
    expect(screen.getByLabelText("Instrument")).toHaveAttribute("id", "inst");
    expect(screen.getByText("Select the calibrated instrument")).toBeInTheDocument();
  });

  it("replaces helper with the fail-glyph error text when invalid", () => {
    render(
      <FormRow label="Serial" error="Required">
        <TextInput />
      </FormRow>,
    );
    expect(screen.getByText("Required")).toHaveClass("text-status-fail-fg");
    expect(screen.queryByText("helper")).not.toBeInTheDocument();
  });
});

describe("StatusChip (§4.2/§4.3)", () => {
  it("renders every status with its treatment and label", () => {
    const statuses = ["pass", "warn", "fail", "info", "locked"] as const;
    statuses.forEach((s) => {
      render(<StatusChip status={s} label={s.toUpperCase()} />);
    });
    expect(screen.getByText("PASS").className).toContain("bg-status-pass-bg");
    expect(screen.getByText("LOCKED").className).toContain("bg-paper-sunken");
    expect(screen.getByText("INFO")).toHaveTextContent("ƒx");
  });

  it("Caption is the uppercase 11px section label", () => {
    render(<Caption>Section A — dimensions</Caption>);
    expect(screen.getByText("Section A — dimensions").className).toContain("uppercase");
  });
});

describe("SectionCard + EmptyState (§5)", () => {
  it("renders the paper-format letter, title, and actions", () => {
    render(
      <SectionCard letter="A" title="Dimensions" actions={<button type="button">Add</button>}>
        body
      </SectionCard>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Dimensions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("EmptyState pairs the icon with one operational sentence", () => {
    render(
      <EmptyState
        icon={<Wrench size={20} />}
        message="No instruments yet"
        action={<button type="button">Add instrument</button>}
      />,
    );
    expect(screen.getByText("No instruments yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add instrument" })).toBeInTheDocument();
  });
});

describe("DataTable (§5)", () => {
  it("sticks the header and first column, borders only (zebra-free)", () => {
    render(
      <DataTable>
        <THead>
          <TR>
            <TH sticky>Serial</TH>
            <TH>Label</TH>
          </TR>
        </THead>
        <tbody>
          <TR>
            <TD sticky mono>
              1
            </TD>
            <TD>SHAFT DIA</TD>
          </TR>
        </tbody>
      </DataTable>,
    );
    expect(screen.getByText("Serial").closest("th")).toHaveClass("sticky");
    expect(screen.getByText("1").className).toContain("measurement");
    expect(screen.getByText("SHAFT DIA").closest("td")).not.toHaveClass("bg-status-pass-bg");
  });
});

describe("MeasurementCell (§5 — the product atom)", () => {
  it("renders empty with the paper fill when no value is committed", () => {
    const onCommit = vi.fn();
    render(
      <MeasurementCell
        nominal={10}
        tolPlus={0.5}
        tolMinus={0.5}
        value={null}
        onCommit={onCommit}
        ariaLabel="cell"
      />,
    );
    const input = screen.getByRole("textbox", { name: "cell" });
    expect(input.closest("div")?.className).toContain("bg-paper-raised");
  });

  it("classifies committed values: pass, warn (10% band), fail", () => {
    const { rerender } = render(
      <MeasurementCell
        nominal={10}
        tolPlus={0.5}
        tolMinus={0.5}
        value={10.05}
        onCommit={() => {}}
        ariaLabel="cell"
      />,
    );
    expect(screen.getByRole("textbox", { name: "cell" }).closest("div")?.className).toContain(
      "bg-status-pass-bg",
    );

    rerender(
      <MeasurementCell
        nominal={10}
        tolPlus={0.5}
        tolMinus={0.5}
        value={10.45}
        onCommit={() => {}}
        ariaLabel="cell"
      />,
    );
    expect(screen.getByRole("textbox", { name: "cell" }).closest("div")?.className).toContain(
      "bg-status-warn-bg",
    );

    rerender(
      <MeasurementCell
        nominal={10}
        tolPlus={0.5}
        tolMinus={0.5}
        value={9}
        onCommit={() => {}}
        ariaLabel="cell"
      />,
    );
    expect(screen.getByRole("textbox", { name: "cell" }).closest("div")?.className).toContain(
      "bg-status-fail-bg",
    );
  });

  it("commits the typed number on blur (decimal comma tolerated)", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <MeasurementCell
        nominal={10}
        tolPlus={0.5}
        tolMinus={0.5}
        value={null}
        onCommit={onCommit}
        ariaLabel="cell"
      />,
    );
    const input = screen.getByRole("textbox", { name: "cell" });
    await user.type(input, "9,88");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(9.88);
  });

  it("commits null when the field is cleared", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <MeasurementCell
        nominal={10}
        tolPlus={0.5}
        tolMinus={0.5}
        value={10}
        onCommit={onCommit}
        ariaLabel="cell"
      />,
    );
    const input = screen.getByRole("textbox", { name: "cell" });
    await user.clear(input);
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("FxTag marks auto-computed values", () => {
    render(<FxTag label="AUTO-CALC" />);
    expect(screen.getByText(/AUTO-CALC/)).toBeInTheDocument();
  });
});

describe("CompliancePanel + WizardRail (§5/§7.2)", () => {
  it("shows the mono readout and flips to the fail treatment on a tripped gate", () => {
    const { rerender, container } = render(
      <CompliancePanel title="Dew point spread" readout="2.4" unit="°C" note="Compliant" />,
    );
    expect(screen.getByText("2.4")).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain("bg-paper-sunken");

    rerender(
      <CompliancePanel
        title="Dew point spread"
        readout="3.2"
        unit="°C"
        status="fail"
        note="Coating prohibited"
      />,
    );
    expect(container.firstElementChild?.className).toContain("bg-status-fail-bg");
    expect(screen.getByText("Coating prohibited")).toHaveClass("text-status-fail-fg");
  });

  it("WizardRail allows returning to done/current steps, blocks pending", () => {
    const onStepClick = vi.fn();
    render(
      <WizardRail
        steps={["Header", "Readings", "Sign-off"]}
        current={1}
        onStepClick={onStepClick}
      />,
    );
    const done = screen.getByRole("button", { name: "Header" });
    const pending = screen.getByRole("button", { name: "Sign-off" });
    expect(pending).toBeDisabled();
    fireEvent.click(done);
    expect(onStepClick).toHaveBeenCalledWith(0);
  });
});

describe("SignOffBlock (§5, SO-01…04)", () => {
  it("renders the signed treatment with server timestamp and hash", () => {
    render(
      <SignOffBlock
        role="Inspector"
        name="A. Kumar"
        cert="NACE CIP Level 2"
        signedAtIso="2026-09-16T05:30:00Z"
        hash="a1b2c3d4e5f67890"
      />,
    );
    expect(screen.getByText("A. Kumar")).toBeInTheDocument();
    expect(screen.getByText("NACE CIP Level 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Signed record")).toBeInTheDocument();
    expect(screen.getByText("a1b2c3d4e5f6")).toBeInTheDocument();
  });

  it("renders pending dimmed with no timestamp", () => {
    render(<SignOffBlock role="Quality Head" name={null} signedAtIso={null} pending />);
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.queryByLabelText("Signed record")).not.toBeInTheDocument();
  });
});

describe("Toast (§5)", () => {
  it("renders title and description inside the provider", () => {
    render(
      <ToastProvider>
        <Toast open onOpenChange={() => {}} title="Batch submitted" description="ST/B/2026/0001" />
      </ToastProvider>,
    );
    expect(screen.getByText("Batch submitted")).toBeInTheDocument();
    expect(screen.getByText("ST/B/2026/0001")).toBeInTheDocument();
  });
});
