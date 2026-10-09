import { describe, it, expect } from "vitest";
import { networkForPassphrase } from "../lib/network";

describe("networkForPassphrase", () => {
  it("maps the mainnet passphrase to the mainnet kit network", () => {
    expect(networkForPassphrase("Public Global Stellar Network ; September 2015")).toBe(
      "Public Global Stellar Network ; September 2015",
    );
  });

  it("maps the testnet passphrase to the testnet kit network", () => {
    expect(networkForPassphrase("Test SDF Network ; September 2015")).toBe(
      "Test SDF Network ; September 2015",
    );
  });

  it("raises a configuration error for an unknown passphrase", () => {
    expect(() => networkForPassphrase("Regtest ; 2026")).toThrow(/Unknown Stellar network passphrase/);
  });
});
