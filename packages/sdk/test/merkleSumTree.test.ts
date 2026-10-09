import { describe, it, expect } from "vitest";
import { MerkleSumTree } from "../src/merkleSumTree.js";
import { poseidon } from "../src/poseidon.js";
import type { Holder, InclusionProof } from "../src/types.js";

const holders: Holder[] = [
  { userId: 1n, balance: 30n },
  { userId: 2n, balance: 20n },
  { userId: 3n, balance: 15n },
  { userId: 4n, balance: 12n },
  { userId: 5n, balance: 8n },
];

describe("MerkleSumTree.verifyProof", () => {
  it("accepts an honest inclusion proof", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    await expect(MerkleSumTree.verifyProof(tree.proofFor(2))).resolves.toBe(true);
  });

  it("rejects a truncated proof with no siblings", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    const proof = tree.proofFor(0);
    const truncated: InclusionProof = { ...proof, siblings: [], pathBits: [] };
    await expect(MerkleSumTree.verifyProof(truncated)).resolves.toBe(false);
  });

  it("rejects a proof whose path bits are shorter than its siblings", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    const proof = tree.proofFor(1);
    const truncated: InclusionProof = { ...proof, pathBits: proof.pathBits.slice(0, 1) };
    await expect(MerkleSumTree.verifyProof(truncated)).resolves.toBe(false);
  });

  it("rejects a non-binary path bit", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    const proof = tree.proofFor(3);
    const bad: InclusionProof = { ...proof, pathBits: [...proof.pathBits.slice(0, -1), 2] };
    await expect(MerkleSumTree.verifyProof(bad)).resolves.toBe(false);
  });

  it("rejects an arbitrary balance with a self-consistent but empty path", async () => {
    const balance = 1_000_000n;
    const leafHash = await poseidon([7n, balance]);
    const forged: InclusionProof = {
      index: 0,
      userId: 7n,
      balance,
      leafHash,
      siblings: [],
      pathBits: [],
      depth: 4,
      root: leafHash,
      total: balance,
    };
    await expect(MerkleSumTree.verifyProof(forged)).resolves.toBe(false);
  });
});
