import { describe, it, expect } from "vitest";
import { MerkleSumTree, buildCircuitInput, buildPrivateInput } from "../src/index.js";
import { BITS, MAX_BALANCE } from "../src/range.js";

const holder = (balance: bigint) => ({ userId: 1n, balance });

// The circuit range-checks every leaf balance with Num2Bits(BITS), so only
// balances in [0, 2^64) can produce a witness. These tests pin the client-side
// rejection (which runs before snarkjs.groth16.fullProve) to that bound.
describe("circuit balance range validation (BITS = 64)", () => {
  it("exposes BITS = 64", () => {
    expect(BITS).toBe(64);
  });

  it("rejects a balance of 2^64", async () => {
    await expect(MerkleSumTree.build([holder(MAX_BALANCE)], 2)).rejects.toThrow(/BITS = 64/);
    expect(() => buildCircuitInput([holder(MAX_BALANCE)], 2)).toThrow(/BITS = 64/);
    expect(() => buildPrivateInput([holder(MAX_BALANCE)], [], 0n, 2, 1)).toThrow(/BITS = 64/);
  });

  it("rejects a negative balance", async () => {
    await expect(MerkleSumTree.build([holder(-1n)], 2)).rejects.toThrow(/BITS = 64/);
    expect(() => buildPrivateInput([], [holder(-1n)], 0n, 2, 1)).toThrow(/BITS = 64/);
  });

  it("names the offending row", async () => {
    await expect(MerkleSumTree.build([holder(1n), holder(MAX_BALANCE)], 2)).rejects.toThrow(
      /row 1/,
    );
  });

  it("accepts 2^64 - 1 and produces a witness", async () => {
    const tree = await MerkleSumTree.build([holder(MAX_BALANCE - 1n)], 2);
    expect(tree.total).toBe(MAX_BALANCE - 1n);

    const input = buildPrivateInput([holder(MAX_BALANCE - 1n)], [], 0n, 2, 1);
    expect(input.balances[0]).toBe((MAX_BALANCE - 1n).toString());
    expect(input.userIds[0]).toBe("1");
  });
});
