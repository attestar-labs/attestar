// @ts-nocheck
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Panel, Eyebrow, Stat } from "@/components/panel";

// panel.tsx exports the primitives every console view is built from. Stat's
// tone prop is the only thing that colours a verdict, so a regression would
// make an INSOLVENT result render with no visual signal.
describe("Panel", () => {
  it("renders children inside the base surface", () => {
    render(<Panel>hello panel</Panel>);
    const el = screen.getByText("hello panel");
    expect(el).toBeInTheDocument();
    expect(el.classList.contains("rounded-2xl")).toBe(true);
  });

  it("forwards arbitrary div props and merges className rather than dropping it", () => {
    render(
      <Panel aria-label="reserves" data-kind="card" className="extra-class">
        body
      </Panel>,
    );
    const el = screen.getByLabelText("reserves");
    expect(el).toHaveAttribute("data-kind", "card");
    expect(el.classList.contains("extra-class")).toBe(true);
    expect(el.classList.contains("rounded-2xl")).toBe(true);
  });
});

describe("Eyebrow", () => {
  it("renders its children with the uppercase tracked treatment", () => {
    render(<Eyebrow>Issuer console</Eyebrow>);
    const el = screen.getByText("Issuer console");
    expect(el.classList.contains("uppercase")).toBe(true);
    expect(el.classList.contains("tracking-[0.3em]")).toBe(true);
  });
});

describe("Stat", () => {
  it("renders text-proven for tone=proven", () => {
    render(<Stat label="Verdict" value="SOLVENT" tone="proven" />);
    expect(screen.getByText("SOLVENT").classList.contains("text-proven")).toBe(true);
  });

  it("renders text-failed for tone=failed", () => {
    render(<Stat label="Verdict" value="INSOLVENT" tone="failed" />);
    expect(screen.getByText("INSOLVENT").classList.contains("text-failed")).toBe(true);
  });

  it("renders text-bone by default", () => {
    render(<Stat label="Latest epoch" value="7" />);
    expect(screen.getByText("7").classList.contains("text-bone")).toBe(true);
  });

  it("shows the label alongside the value", () => {
    render(<Stat label="On-chain USDC" value="5,000 USDC" />);
    expect(screen.getByText("On-chain USDC")).toBeInTheDocument();
    expect(screen.getByText("5,000 USDC")).toBeInTheDocument();
  });
});
