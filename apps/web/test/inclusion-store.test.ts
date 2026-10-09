import { Buffer } from "buffer";
import { describe, it, expect } from "vitest";
import { MerkleSumTree, fieldToBytes } from "@attestar/sdk";
import { toStoredProof, verifyStoredInclusion } from "../lib/inclusion-store";

const holders = [
  { userId: 1n, balance: 300n },
  { userId: 2n, balance: 200n },
  { userId: 3n, balance: 150n },
];

const rootHex = (root: bigint) => Buffer.from(fieldToBytes(root)).toString("hex");

describe("holder inclusion is verified against the on-chain root", () => {
  it("accepts a stored path that folds to the root the chain recorded", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    const stored = toStoredProof(tree.proofFor(1));

    const res = await verifyStoredInclusion(stored, rootHex(tree.root));

    expect(res.ok).toBe(true);
    expect(res.stale).toBe(false);
    expect(res.tampered).toBe(false);
    expect(res.balance).toBe("200");
  });

  it("fails when a stored sibling is tampered with", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    const stored = toStoredProof(tree.proofFor(1));
    stored.siblings[0] = {
      ...stored.siblings[0],
      hash: (BigInt(stored.siblings[0].hash) + 1n).toString(),
    };

    const res = await verifyStoredInclusion(stored, rootHex(tree.root));

    expect(res.ok).toBe(false);
    expect(res.tampered).toBe(true);
    expect(res.stale).toBe(false);
  });

  it("fails when the stored leaf is tampered with", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    const stored = toStoredProof(tree.proofFor(1));
    stored.balance = (BigInt(stored.balance) + 1n).toString();

    const res = await verifyStoredInclusion(stored, rootHex(tree.root));

    expect(res.ok).toBe(false);
    expect(res.tampered).toBe(true);
  });

  it("reports stale when its own root does not match the chain", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    const stored = toStoredProof(tree.proofFor(0));
    const other = await MerkleSumTree.build([{ userId: 9n, balance: 5n }], 4);

    const res = await verifyStoredInclusion(stored, rootHex(other.root));

    expect(res.ok).toBe(false);
    expect(res.stale).toBe(true);
    expect(res.tampered).toBe(false);
  });

  it("is not accepted when no attestation exists on chain", async () => {
    const tree = await MerkleSumTree.build(holders, 4);
    const stored = toStoredProof(tree.proofFor(0));

    const res = await verifyStoredInclusion(stored, null);

    expect(res.ok).toBe(false);
    expect(res.stale).toBe(false);
  });
});
