// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({
    address: "GAUDITOR",
    connect: vi.fn(),
    connecting: false,
    signMessage: vi.fn().mockResolvedValue("signed"),
  }),
}));

vi.mock("@/lib/contracts", () => ({
  attestarReader: () => ({ latest: () => Promise.resolve({ result: null }) }),
}));

vi.mock("@/lib/disclosure", () => ({
  DEFAULT_VIEW_KEY: "view-key",
  loadDisclosure: () => ({ salt: "s", iv: "i", ct: "c", epoch: "1" }),
  decryptDisclosure: () =>
    Promise.resolve({
      ledger: [
        { userId: "1", balance: "10", label: "Good" },
        { userId: "2", balance: "1e3", label: "Broken" },
      ],
      sources: [],
      onchain: "0",
      solvent: false,
    }),
}));

import { RegulatorView } from "../components/regulator-view";

describe("RegulatorView disclosure parsing", () => {
  it("renders a row-level error for an unparseable disclosed balance", async () => {
    render(<RegulatorView />);
    fireEvent.click(screen.getByText(/Sign & unlock disclosure/i));
    await waitFor(() => {
      expect(screen.getByText(/unparseable balance/i)).toBeInTheDocument();
    });
    // The verdict still renders rather than throwing during render.
    expect(screen.getByText(/Reserves cover liabilities/i)).toBeInTheDocument();
  });
});
