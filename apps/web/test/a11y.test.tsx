// @ts-nocheck
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RolePicker } from "../components/role-picker";
import { SolvencySeal } from "../components/solvency-seal";

describe("interactive controls are accessible", () => {
  it("exposes the role picker as a labelled, single-select group of buttons", () => {
    render(<RolePicker onPick={vi.fn()} />);

    const group = screen.getByRole("radiogroup", { name: /pick a role/i });
    expect(group).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio.tagName).toBe("BUTTON");
      expect(radio).toHaveAttribute("aria-checked");
    }
  });

  it("announces the solvency verdict as text, not colour alone", () => {
    render(<SolvencySeal status="solvent" />);

    expect(screen.getByText("SOLVENT")).toBeInTheDocument();
    expect(screen.getByText(/solvency status: solvent/i)).toBeInTheDocument();
  });
});
