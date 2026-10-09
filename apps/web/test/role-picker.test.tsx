// @ts-nocheck
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@phosphor-icons/react", () => ({
  Buildings: () => <span data-testid="icon-issuer" />,
  User: () => <span data-testid="icon-holder" />,
  Scales: () => <span data-testid="icon-regulator" />,
  ArrowRight: () => <span data-testid="icon-arrow" />,
}));

import { RolePicker } from "@/components/role-picker";

describe("RolePicker", () => {
  it("reports the correct role for each card, once per click", () => {
    const onPick = vi.fn();
    render(<RolePicker onPick={onPick} />);

    fireEvent.click(screen.getByRole("button", { name: /^Issuer/ }));
    expect(onPick).toHaveBeenNthCalledWith(1, "issuer");

    fireEvent.click(screen.getByRole("button", { name: /^Holder/ }));
    expect(onPick).toHaveBeenNthCalledWith(2, "holder");

    fireEvent.click(screen.getByRole("button", { name: /^Regulator/ }));
    expect(onPick).toHaveBeenNthCalledWith(3, "regulator");

    expect(onPick).toHaveBeenCalledTimes(3);
  });

  it("renders a non-empty title, description and action label on every card", () => {
    render(<RolePicker onPick={() => {}} />);

    for (const title of ["Issuer", "Holder", "Regulator"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }

    expect(screen.getByText(/No balance ever leaves your device/)).toBeInTheDocument();
    expect(screen.getByText(/without anyone seeing yours/)).toBeInTheDocument();
    expect(screen.getByText(/Selective disclosure, on demand/)).toBeInTheDocument();
  });

  it("uses distinct action labels for the three cards", () => {
    render(<RolePicker onPick={() => {}} />);

    const labels = ["Prove solvency", "Verify my inclusion", "Audit the breakdown"];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(new Set(labels).size).toBe(3);
  });
});
