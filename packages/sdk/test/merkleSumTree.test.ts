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
import { describe, it, expect } from "vitest";
import { MerkleSumTree } from "../src/merkleSumTree.js";
import type { Holder, InclusionProof } from "../src/types.js";

const sumOf = (holders: Holder[]): bigint => holders.reduce((acc, h) => acc + h.balance, 0n);

describe("MerkleSumTree totals", () => {
  it("equals the exact bigint sum of the supplied balances for three shapes", async () => {
    const shapes: Holder[][] = [
      [
        { userId: 1n, balance: 30n },
        { userId: 2n, balance: 20n },
        { userId: 3n, balance: 15n },
        { userId: 4n, balance: 12n },
      ],
      [
        { userId: 10n, balance: 1n },
        { userId: 11n, balance: 2n },
        { userId: 12n, balance: 3n },
      ],
      [
        { userId: 7n, balance: 100n },
        { userId: 8n, balance: 250n },
        { userId: 9n, balance: 400n },
        { userId: 10n, balance: 650n },
        { userId: 11n, balance: 1n },
      ],
    ];
    const depths = [2, 3, 4];
    for (let i = 0; i < shapes.length; i++) {
      const tree = await MerkleSumTree.build(shapes[i], depths[i]);
      expect(tree.total).toBe(sumOf(shapes[i]));
    }
  });

  it("pads an under-filled tree to capacity with zero holders", async () => {
    const tree = await MerkleSumTree.build([{ userId: 1n, balance: 5n }], 3);
    expect(tree.capacity).toBe(8);
    expect(tree.holders).toHaveLength(8);
    expect(tree.holders.slice(1).every((h) => h.userId === 0n && h.balance === 0n)).toBe(true);
    expect(tree.total).toBe(5n);
  });

  it("throws instead of truncating when there are more holders than capacity", async () => {
    const holders: Holder[] = [
      { userId: 1n, balance: 1n },
      { userId: 2n, balance: 1n },
      { userId: 3n, balance: 1n },
    ];
    await expect(MerkleSumTree.build(holders, 1)).rejects.toThrow(/too many holders/);
  });
});

describe("MerkleSumTree inclusion paths", () => {
  const holders: Holder[] = [
    { userId: 1n, balance: 30n },
    { userId: 2n, balance: 20n },
    { userId: 3n, balance: 15n },
  ];

  it("verifies every index in 0..capacity-1, including padded leaves", async () => {
    const tree = await MerkleSumTree.build(holders, 3);
    for (let i = 0; i < tree.capacity; i++) {
      const proof = tree.proofFor(i);
      expect(proof.index).toBe(i);
      expect(proof.siblings).toHaveLength(3);
      await expect(MerkleSumTree.verifyProof(proof)).resolves.toBe(true);
    }
  });

  it("rejects a proof whose sibling sum was mutated", async () => {
    const tree = await MerkleSumTree.build(holders, 3);
    const proof = tree.proofFor(1);
    const tampered: InclusionProof = {
      ...proof,
      siblings: proof.siblings.map((s, i) => (i === 0 ? { ...s, sum: s.sum + 1n } : s)),
    };
    await expect(MerkleSumTree.verifyProof(tampered)).resolves.toBe(false);
  });

  it("rejects a proof whose path bit was flipped", async () => {
    const tree = await MerkleSumTree.build(holders, 3);
    const proof = tree.proofFor(1);
    const tampered: InclusionProof = {
      ...proof,
      pathBits: proof.pathBits.map((bit, i) => (i === 0 ? (bit === 0 ? 1 : 0) : bit)),
    };
    await expect(MerkleSumTree.verifyProof(tampered)).resolves.toBe(false);
  });

  it("rejects an out-of-range index", async () => {
    const tree = await MerkleSumTree.build(holders, 2);
    expect(() => tree.proofFor(-1)).toThrow(/out of range/);
    expect(() => tree.proofFor(tree.capacity)).toThrow(/out of range/);
  });
});
