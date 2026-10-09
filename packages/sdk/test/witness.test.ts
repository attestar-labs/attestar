import { describe, it, expect } from "vitest";
import { buildCircuitInput, buildPrivateInput } from "../src/witness.js";
import type { Holder } from "../src/types.js";

const holders: Holder[] = [
  { userId: 1n, balance: 30n },
  { userId: 2n, balance: 20n },
];

describe("buildCircuitInput", () => {
  it("emits exactly 1 << depth balances and ids", () => {
    for (const depth of [2, 3, 4]) {
      const input = buildCircuitInput(holders, depth);
      expect(input.balances).toHaveLength(1 << depth);
      expect(input.userIds).toHaveLength(1 << depth);
    }
  });

  it("keeps the supplied entries first, in order", () => {
    const input = buildCircuitInput(holders, 3);
    expect(input.balances.slice(0, 2)).toEqual(["30", "20"]);
    expect(input.userIds.slice(0, 2)).toEqual(["1", "2"]);
  });

  it("pads the tail with the string '0'", () => {
    const input = buildCircuitInput(holders, 2);
    expect(input.balances).toEqual(["30", "20", "0", "0"]);
    expect(input.userIds).toEqual(["1", "2", "0", "0"]);
  });

  it("throws instead of truncating past capacity", () => {
    const tooMany: Holder[] = [
      { userId: 1n, balance: 1n },
      { userId: 2n, balance: 1n },
      { userId: 3n, balance: 1n },
    ];
    expect(() => buildCircuitInput(tooMany, 1)).toThrow(/too many holders/);
  });
});

describe("buildPrivateInput", () => {
  it("returns 16 liability slots and 8 reserve slots for depths 4 and 3", () => {
    const sources: Holder[] = [
      { userId: 1n, balance: 45n },
      { userId: 2n, balance: 25n },
    ];
    const input = buildPrivateInput(holders, sources, 70n, 4, 3);
    expect(input.balances).toHaveLength(16);
    expect(input.userIds).toHaveLength(16);
    expect(input.reserves).toHaveLength(8);
    expect(input.sourceIds).toHaveLength(8);
  });

  it("returns onchainReserves as a decimal string, not a number", () => {
    const input = buildPrivateInput(holders, [], 12345678901234567890n, 2, 2);
    expect(typeof input.onchainReserves).toBe("string");
    expect(input.onchainReserves).toBe("12345678901234567890");
  });

  it("pads missing reserve slots with '0'", () => {
    const input = buildPrivateInput(holders, [{ userId: 9n, balance: 5n }], 5n, 2, 2);
    expect(input.reserves).toEqual(["5", "0", "0", "0"]);
    expect(input.sourceIds).toEqual(["9", "0", "0", "0"]);
  });

  it("throws when the liability vector overflows", () => {
    const tooMany: Holder[] = Array.from({ length: 3 }, (_, i) => ({
      userId: BigInt(i),
      balance: 1n,
    }));
    expect(() => buildPrivateInput(tooMany, [], 0n, 1, 1)).toThrow(/too many entries/);
  });

  it("throws when the reserve vector overflows", () => {
    const tooMany: Holder[] = Array.from({ length: 5 }, (_, i) => ({
      userId: BigInt(i),
      balance: 1n,
    }));
    expect(() => buildPrivateInput(holders, tooMany, 0n, 3, 2)).toThrow(/too many entries/);
  });
});
