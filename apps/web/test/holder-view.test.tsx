// @ts-nocheck
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// holder-view decides between the committed, stale-tree and failed states from
// result.ok and result.matchesChain. The result Panel is rendered only after a
// successful verify() call, so each test drives the button first.
const chain = vi.hoisted(() => ({ latest: null as any, inclusion: null as any }));

const wallet = vi.hoisted(() => ({
  address: "GHOLDER7XQ2LZQV6WQ2F4SEXAMPLEXKJZ5VQ7XAMPLEQ2LZQV6WQ2F4S",
  connecting: false,
  role: "holder",
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet }));

vi.mock("@/lib/contracts", () => ({
  attestarReader: vi.fn(() => ({ latest: vi.fn(async () => ({ result: chain.latest })) })),
}));

vi.mock("@/lib/prover-browser", () => ({
  inclusionForBrowser: vi.fn(async () => chain.inclusion),
}));

vi.mock("@phosphor-icons/react", () => ({
  User: () => <span data-testid="icon-user" />,
  ShieldCheck: () => <span data-testid="icon-shield" />,
  Wallet: () => <span data-testid="icon-wallet" />,
  SealCheck: () => <span data-testid="icon-seal-check" />,
  Warning: () => <span data-testid="icon-warning" />,
}));

import { HolderView } from "@/components/holder-view";

const ROOT_HEX = "ab".repeat(32);
const OTHER_ROOT_HEX = "cd".repeat(32);

function bytesFromHex(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function clickVerify() {
  const button = await screen.findByRole("button", { name: /^Verify / });
  fireEvent.click(button);
}

describe("HolderView inclusion results", () => {
  beforeEach(() => {
    chain.latest = null;
    chain.inclusion = null;
  });

  it("shows the empty state when no attestation is published", async () => {
    render(<HolderView />);
    expect(await screen.findByText(/No attestation published yet/)).toBeInTheDocument();
  });

  it("renders the verified message and SealCheck when ok and the root matches", async () => {
    chain.latest = { epoch: 7, solvent: true, liab_root: bytesFromHex(ROOT_HEX) };
    chain.inclusion = { ok: true, balance: "30000000000", rootHex: ROOT_HEX };
    render(<HolderView />);

    await waitFor(() => expect(screen.queryByText(/No attestation published yet/)).toBeNull());
    await clickVerify();

    expect(
      await screen.findByText(/is committed in the proof the chain verified/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("icon-seal-check")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-warning")).toBeNull();
  });

  it("renders the stale-tree warning when ok but the root does not match", async () => {
    chain.latest = { epoch: 7, solvent: true, liab_root: bytesFromHex(ROOT_HEX) };
    chain.inclusion = { ok: true, balance: "30000000000", rootHex: OTHER_ROOT_HEX };
    render(<HolderView />);

    await waitFor(() => expect(screen.queryByText(/No attestation published yet/)).toBeNull());
    await clickVerify();

    expect(await screen.findByText(/Inclusion holds locally/)).toBeInTheDocument();
    expect(screen.queryByTestId("icon-seal-check")).toBeNull();
    expect(screen.getByTestId("icon-warning")).toBeInTheDocument();
  });

  it("renders the failure state with the Warning icon when ok is false", async () => {
    chain.latest = { epoch: 7, solvent: true, liab_root: bytesFromHex(ROOT_HEX) };
    chain.inclusion = { ok: false, balance: "30000000000", rootHex: ROOT_HEX };
    render(<HolderView />);

    await waitFor(() => expect(screen.queryByText(/No attestation published yet/)).toBeNull());
    await clickVerify();

    expect(await screen.findByText("Inclusion check failed.")).toBeInTheDocument();
    expect(screen.getByTestId("icon-warning")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-seal-check")).toBeNull();
  });
});
