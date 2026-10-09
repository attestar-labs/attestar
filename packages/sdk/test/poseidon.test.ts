import { describe, it, expect } from "vitest";
import { getPoseidon, poseidon } from "../src/poseidon.js";

describe("getPoseidon caching", () => {
  it("returns the identical instance on repeated calls", async () => {
    const first = await getPoseidon();
    const second = await getPoseidon();
    expect(first).toBe(second);
  });
});

describe("poseidon", () => {
  it("is deterministic and returns a bigint", async () => {
    const a = await poseidon([1n, 2n]);
    const b = await poseidon([1n, 2n]);
    expect(typeof a).toBe("bigint");
    expect(a).toBe(b);
  });

  it("stays inside the BN254 field", async () => {
    const v = await poseidon([1n, 2n]);
    expect(v >= 0n).toBe(true);
    expect(v < 2n ** 254n).toBe(true);
  });

  it("separates different inputs", async () => {
    const a = await poseidon([1n, 2n]);
    const b = await poseidon([2n, 1n]);
    expect(a).not.toBe(b);
  });
});
