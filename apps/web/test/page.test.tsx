// @ts-nocheck
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// app/page.tsx is the router: it holds the selected role and mounts exactly one
// console, and the header's onHome must return the user to the picker.
vi.mock("@/components/wallet-bar", () => ({
  WalletBar: ({ role, onHome }: any) => (
    <div>
      <span data-testid="wallet-role">{role ?? "none"}</span>
      <button onClick={onHome}>go home</button>
    </div>
  ),
}));

vi.mock("@/components/role-picker", () => ({
  RolePicker: ({ onPick }: any) => (
    <div data-testid="role-picker">
      <button onClick={() => onPick("issuer")}>pick issuer</button>
      <button onClick={() => onPick("holder")}>pick holder</button>
      <button onClick={() => onPick("regulator")}>pick regulator</button>
    </div>
  ),
}));

vi.mock("@/components/issuer-view", () => ({ IssuerView: () => <div data-testid="issuer-view" /> }));
vi.mock("@/components/holder-view", () => ({ HolderView: () => <div data-testid="holder-view" /> }));
vi.mock("@/components/regulator-view", () => ({
  RegulatorView: () => <div data-testid="regulator-view" />,
}));

import Home from "@/app/page";
import { ATTESTAR_ID } from "@/lib/config";

describe("Home role switcher", () => {
  it("renders the picker and no console before a role is chosen", () => {
    render(<Home />);
    expect(screen.getByTestId("role-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("issuer-view")).toBeNull();
    expect(screen.queryByTestId("holder-view")).toBeNull();
    expect(screen.queryByTestId("regulator-view")).toBeNull();
  });

  it("mounts only the console for the selected role", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "pick issuer" }));
    expect(screen.getByTestId("issuer-view")).toBeInTheDocument();
    expect(screen.queryByTestId("role-picker")).toBeNull();
    expect(screen.queryByTestId("holder-view")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "go home" }));
    fireEvent.click(screen.getByRole("button", { name: "pick holder" }));
    expect(screen.getByTestId("holder-view")).toBeInTheDocument();
    expect(screen.queryByTestId("issuer-view")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "go home" }));
    fireEvent.click(screen.getByRole("button", { name: "pick regulator" }));
    expect(screen.getByTestId("regulator-view")).toBeInTheDocument();
    expect(screen.queryByTestId("holder-view")).toBeNull();
  });

  it("returns to the picker when the header calls onHome", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "pick issuer" }));
    expect(screen.getByTestId("issuer-view")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "go home" }));
    expect(screen.getByTestId("role-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("issuer-view")).toBeNull();
  });

  it("links the footer to the configured contract", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: /Contract on-chain/ });
    expect(link.getAttribute("href")).toContain(ATTESTAR_ID);
  });
});
