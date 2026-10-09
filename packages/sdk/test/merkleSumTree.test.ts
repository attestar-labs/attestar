import { describe, it, expect } from "vitest";
import {
  MerkleSumTree,
  poseidon,
  assertLeafAmount,
  LeafAmountRangeError,
  MAX_LEAF_AMOUNT,
} from "../src/index.js";

describe("MerkleSumTree leaf-range enforcement", () => {
  it("accepts a leaf at 2^64 - 1", async () => {
    const tree = await MerkleSumTree.build([{ userId: 1n, balance: MAX_LEAF_AMOUNT }], 1);
    expect(tree.total).toBe(MAX_LEAF_AMOUNT);
  });

  it("rejects a leaf above 2^64 - 1 with a typed error", async () => {
    await expect(
      MerkleSumTree.build([{ userId: 1n, balance: MAX_LEAF_AMOUNT + 1n }], 1),
    ).rejects.toBeInstanceOf(LeafAmountRangeError);
  });

  it("rejects a negative leaf", () => {
    expect(() => assertLeafAmount(-1n)).toThrow(LeafAmountRangeError);
  });

  it("rejects JavaScript number amounts outright", () => {
    // @ts-expect-error the runtime guard exists precisely to catch this mistake
    expect(() => assertLeafAmount(1)).toThrow(TypeError);
  });
});

describe("MerkleSumTree totals above Number.MAX_SAFE_INTEGER", () => {
  it("keeps the total exact and matches an independently computed root", async () => {
    const big = 2n ** 53n + 12345n; // > Number.MAX_SAFE_INTEGER
    const holders = [
      { userId: 1n, balance: big },
      { userId: 2n, balance: big },
    ];
    const tree = await MerkleSumTree.build(holders, 1);
    expect(tree.total).toBe(2n * big);
    expect(tree.total > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);

    // Recompute the depth-1 root from first principles: parent =
    // poseidon(left.hash, left.sum, right.hash, right.sum).
    const leaf1 = await poseidon([1n, big]);
    const leaf2 = await poseidon([2n, big]);
    const expectedRoot = await poseidon([leaf1, big, leaf2, big]);
    expect(tree.root).toBe(expectedRoot);
  });
});
