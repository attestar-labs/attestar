import { describe, it, expect } from "vitest";
import { fieldToBytes } from "../src/groth16encode.js";

const zeros = (n: number) => Array.from({ length: n }, () => 0);

describe("fieldToBytes", () => {
  it("encodes 0 as 32 zero bytes", () => {
    expect(Array.from(fieldToBytes(0n))).toEqual(zeros(32));
  });

  it("encodes 1 as 31 zeros followed by 01", () => {
    const out = Array.from(fieldToBytes(1n));
    expect(out.slice(0, 31)).toEqual(zeros(31));
    expect(out[31]).toBe(1);
  });

  it("rejects a negative value", () => {
    expect(() => fieldToBytes(-1n)).toThrow(/out of range/);
  });

  it("rejects 2**256", () => {
    expect(() => fieldToBytes(2n ** 256n)).toThrow(/out of range/);
  });

  it("accepts the largest 32-byte value", () => {
    expect(fieldToBytes(2n ** 256n - 1n)).toHaveLength(32);
  });
});
