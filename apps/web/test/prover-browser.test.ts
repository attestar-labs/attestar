// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";

// prover-browser derives the verdict and the two published roots from the
// positional public signals the circuit fixes as
// [liab_root, res_root, solvent, onchain_reserves]. We mock only snarkjs
// (the browser prover) and exercise the real SDK tree math and field encoding.
const snark = vi.hoisted(() => ({
  proof: { pi_a: ["1", "2"], pi_b: [["3", "4"], ["5", "6"]], pi_c: ["7", "8"] },
  publicSignals: ["1", "2", "1", "5000"],
}));

vi.mock("snarkjs", () => ({
  groth16: {
    fullProve: vi.fn(async () => ({ proof: snark.proof, publicSignals: snark.publicSignals })),
  },
}));

import { proveSolvencyPrivate, inclusionForBrowser, LIAB_DEPTH, RES_DEPTH } from "@/lib/prover-browser";
import { MerkleSumTree, fieldToBytes } from "@attestar/sdk";

const holders = [
  { userId: 111n, balance: 5000n },
  { userId: 222n, balance: 3000n },
  { userId: 333n, balance: 1500n },
];
const sources = [
  { userId: 1n, balance: 4000n },
  { userId: 2n, balance: 3000n },
];

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("proveSolvencyPrivate", () => {
  beforeEach(() => {
    snark.publicSignals = ["1", "2", "1", "5000"];
  });

  it("maps publicSignals to solvent and returns the merkle-sum roots", async () => {
    const liabTree = await MerkleSumTree.build(holders, LIAB_DEPTH);
    const resTree = await MerkleSumTree.build(sources, RES_DEPTH);

    const result = await proveSolvencyPrivate(holders, sources, 5000n);

    expect(result.solvent).toBe(true);
    expect(result.liabRoot.equals(Buffer.from(fieldToBytes(liabTree.root)))).toBe(true);
    expect(result.resRoot.equals(Buffer.from(fieldToBytes(resTree.root)))).toBe(true);
    expect(result.liabRootHex).toBe(hex(fieldToBytes(liabTree.root)));
    expect(result.resRootHex).toBe(hex(fieldToBytes(resTree.root)));
  });

  it("reports insolvent when publicSignals[2] is 0", async () => {
    snark.publicSignals = ["1", "2", "0", "5000"];
    const result = await proveSolvencyPrivate(holders, sources, 5000n);
    expect(result.solvent).toBe(false);
  });

  it("emits 64/128/64-byte group elements", async () => {
    const result = await proveSolvencyPrivate(holders, sources, 5000n);
    expect(result.proof.a).toHaveLength(64);
    expect(result.proof.b).toHaveLength(128);
    expect(result.proof.c).toHaveLength(64);
  });
});

describe("inclusionForBrowser", () => {
  it("verifies a freshly built ledger and reports the holder balance as a string", async () => {
    const tree = await MerkleSumTree.build(holders, LIAB_DEPTH);

    const result = await inclusionForBrowser(holders, 1);

    expect(result.ok).toBe(true);
    expect(result.balance).toBe("3000");
    expect(result.rootHex).toBe(hex(fieldToBytes(tree.root)));
  });
});
