// @ts-nocheck
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifierIsSet: vi.fn(),
  latest: vi.fn(),
  balance: vi.fn(),
}));

vi.mock("@/lib/contracts", () => ({
  attestarReader: () => ({ latest: mocks.latest }),
  tokenReader: () => ({ balance: mocks.balance }),
  attestarSigner: () => ({ set_verifier: () => ({ signAndSend: async () => ({}) }) }),
  tokenSigner: () => ({ transfer: () => ({ signAndSend: async () => ({}) }) }),
  verifierIsSet: mocks.verifierIsSet,
}));

vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({ address: null, connect: vi.fn(), signTransaction: vi.fn() }),
}));

import { IssuerView } from "../components/issuer-view";

// Verifier cache key for the default ATTESTAR_ID in apps/web/lib/config.ts.
const VERIFIER_FLAG =
  "attestar:verifier:CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH";

describe("issuer setup panel is driven by on-chain verifier state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.verifierIsSet.mockReset();
    mocks.latest.mockResolvedValue({ result: null });
    mocks.balance.mockResolvedValue({ result: 0n });
  });

  it("hides the panel when the contract stores a key and the cache is empty", async () => {
    mocks.verifierIsSet.mockResolvedValue(true);
    render(<IssuerView />);
    await waitFor(() => expect(mocks.verifierIsSet).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/One-time setup/)).not.toBeInTheDocument());
  });

  it("shows the panel when a stale flag is present but no key is stored", async () => {
    window.localStorage.setItem(VERIFIER_FLAG, "1");
    mocks.verifierIsSet.mockResolvedValue(false);
    render(<IssuerView />);
    await waitFor(() => expect(screen.getByText(/One-time setup/)).toBeInTheDocument());
  });
});
