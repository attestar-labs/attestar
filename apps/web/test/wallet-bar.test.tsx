// @ts-nocheck
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shortHash } from "@/lib/format";

const wallet = vi.hoisted(() => ({
  address: null,
  connecting: false,
  connect: vi.fn(async () => null),
  disconnect: vi.fn(async () => {}),
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet }));

vi.mock("@phosphor-icons/react", () => ({
  Wallet: () => <span data-testid="icon-wallet" />,
  SignOut: () => <span data-testid="icon-signout" />,
}));

import { WalletBar } from "@/components/wallet-bar";

const ADDRESS = "GD2ASCDOYWLJKUWN5KZW6WV5SARW3HKXPKBFX6Y3THDFFM4HXQXY7KKA";

describe("WalletBar", () => {
  beforeEach(() => {
    wallet.address = null;
    wallet.connecting = false;
    wallet.connect.mockClear();
    wallet.disconnect.mockClear();
  });

  it("renders Connect Freighter when disconnected", () => {
    render(<WalletBar role="issuer" onHome={() => {}} />);
    expect(screen.getByRole("button", { name: /Connect Freighter/ })).toBeEnabled();
  });

  it("renders Connecting… and disables the button while connecting", () => {
    wallet.connecting = true;
    render(<WalletBar role="issuer" onHome={() => {}} />);
    const button = screen.getByRole("button", { name: /Connecting/ });
    expect(button).toBeDisabled();
  });

  it("defaults the connect role to issuer when no role is set", () => {
    render(<WalletBar role={null} onHome={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Connect Freighter/ }));
    expect(wallet.connect).toHaveBeenCalledTimes(1);
    expect(wallet.connect).toHaveBeenCalledWith("issuer");
  });

  it("connects with the selected role", () => {
    render(<WalletBar role="holder" onHome={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Connect Freighter/ }));
    expect(wallet.connect).toHaveBeenCalledWith("holder");
  });

  it("renders the shortened address and the Disconnect wallet control when connected", () => {
    wallet.address = ADDRESS;
    render(<WalletBar role="issuer" onHome={() => {}} />);

    expect(screen.getByText(shortHash(ADDRESS, 5))).toBeInTheDocument();
    const disconnect = screen.getByRole("button", { name: "Disconnect wallet" });
    fireEvent.click(disconnect);
    expect(wallet.disconnect).toHaveBeenCalledTimes(1);
  });

  it("renders the role label in sentence case for all three roles", () => {
    const { rerender } = render(<WalletBar role="issuer" onHome={() => {}} />);
    expect(screen.getByText("Issuer console")).toBeInTheDocument();

    rerender(<WalletBar role="holder" onHome={() => {}} />);
    expect(screen.getByText("Holder console")).toBeInTheDocument();

    rerender(<WalletBar role="regulator" onHome={() => {}} />);
    expect(screen.getByText("Regulator console")).toBeInTheDocument();
  });
});
