// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({ address: null, connect: vi.fn(), connecting: false, signMessage: vi.fn() }),
}));

vi.mock("@/lib/contracts", () => ({
  attestarReader: () => ({ latest: () => Promise.resolve({ result: null }) }),
}));

vi.mock("@/lib/disclosure", () => ({
  DEFAULT_VIEW_KEY: "view-key",
  loadDisclosure: () => null,
  decryptDisclosure: vi.fn(),
}));

import { RegulatorView } from "../components/regulator-view";

describe("RegulatorView public panel with no attestation", () => {
  it("renders an em dash for every public row when latest() is null", async () => {
    render(<RegulatorView />);
    await screen.findByText("Epoch");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/No attestation published yet/i)).toBeInTheDocument();
  });
});
