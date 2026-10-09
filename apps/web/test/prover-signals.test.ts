import { describe, it, expect } from "vitest";
import { checkPublicSignals } from "../lib/prover-browser";

const liabRoot = 111n;
const resRoot = 222n;
const onchain = 5000n;
const signals = (liab: bigint, res: bigint, solvent: bigint, chain: bigint) => [
  liab.toString(),
  res.toString(),
  solvent.toString(),
  chain.toString(),
];

describe("checkPublicSignals", () => {
  it("returns the solvent verdict for a well-formed vector", () => {
    expect(checkPublicSignals(signals(liabRoot, resRoot, 1n, onchain), liabRoot, resRoot, onchain)).toBe(
      true,
    );
    expect(checkPublicSignals(signals(liabRoot, resRoot, 0n, onchain), liabRoot, resRoot, onchain)).toBe(
      false,
    );
  });

  it("rejects a liabilities root that does not match the local tree", () => {
    expect(() =>
      checkPublicSignals(signals(liabRoot + 1n, resRoot, 1n, onchain), liabRoot, resRoot, onchain),
    ).toThrow(/liabilities root/);
  });

  it("rejects a mismatched on-chain reserves signal before submission", () => {
    expect(() =>
      checkPublicSignals(signals(liabRoot, resRoot, 1n, onchain + 1n), liabRoot, resRoot, onchain),
    ).toThrow(/on-chain reserves/);
  });

  it("rejects a wrong public signal count", () => {
    expect(() => checkPublicSignals(["1", "2"], liabRoot, resRoot, onchain)).toThrow(/count/);
  });
});
