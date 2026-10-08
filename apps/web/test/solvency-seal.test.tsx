// @ts-nocheck
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SolvencySeal } from "../components/solvency-seal";

describe("SolvencySeal", () => {
  it("renders SOLVENT plus ZK proof verified and text-proven for solvent", () => {
    const { container } = render(<SolvencySeal status="solvent" />);
    
    // Asserts visible word
    expect(screen.getByText("SOLVENT")).toBeInTheDocument();
    
    // Asserts sub-label text
    expect(screen.getByText("ZK proof verified")).toBeInTheDocument();
    
    // Asserts accent class 'text-proven'
    const wordElement = screen.getByText("SOLVENT");
    expect(wordElement.classList.contains("text-proven")).toBe(true);
  });

  it("renders INSOLVENT plus ZK proof verified and text-failed for insolvent", () => {
    const { container } = render(<SolvencySeal status="insolvent" />);
    
    expect(screen.getByText("INSOLVENT")).toBeInTheDocument();
    expect(screen.getByText("ZK proof verified")).toBeInTheDocument();
    
    const wordElement = screen.getByText("INSOLVENT");
    expect(wordElement.classList.contains("text-failed")).toBe(true);
  });

  it("renders AWAITING plus no attestation for none", () => {
    const { container } = render(<SolvencySeal status="none" />);
    
    expect(screen.getByText("AWAITING")).toBeInTheDocument();
    expect(screen.getByText("no attestation")).toBeInTheDocument();
    
    const wordElement = screen.getByText("AWAITING");
    expect(wordElement.classList.contains("text-slate")).toBe(true);
  });

  it("marks the rotating ring with aria-hidden so it is not announced", () => {
    const { container } = render(<SolvencySeal status="solvent" />);
    
    // The rotating ring is the div that contains the seal-ring text path.
    // It has the animate-[seal-rotate_40s_linear_infinite] class.
    const rotatingRing = container.querySelector(".motion-safe\\:animate-\\[seal-rotate_40s_linear_infinite\\]");
    
    expect(rotatingRing).toBeInTheDocument();
    expect(rotatingRing).toHaveAttribute("aria-hidden", "true");
  });
});
