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
import { describe, it, expect } from "vitest";
import { fieldToBytes, encodeFieldElements, toHex } from "../src/index.js";

// BN254 scalar field modulus (the field the PrivateSolvency circuit operates
// over). The largest value a 32-byte field element may hold is modulus - 1.
const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

describe("fieldToBytes", () => {
  it("encodes zero as 32 zero bytes", () => {
    const out = fieldToBytes(0n);
    expect(out.length).toBe(32);
    expect(Array.from(out)).toEqual(new Array(32).fill(0));
  });

  it("encodes one big-endian in the last byte", () => {
    const out = fieldToBytes(1n);
    expect(out.length).toBe(32);
    expect(out[31]).toBe(1);
    expect(Array.from(out.slice(0, 31))).toEqual(new Array(31).fill(0));
  });

  it("encodes the field modulus minus one as 32 bytes", () => {
    const out = fieldToBytes(FIELD_MODULUS - 1n);
    expect(out.length).toBe(32);
    expect(toHex(out)).toBe(
      "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000",
    );
  });

  it("accepts a decimal string like the circuit emits", () => {
    expect(toHex(fieldToBytes("1"))).toBe(toHex(fieldToBytes(1n)));
  });
});

describe("encodeFieldElements", () => {
  it("returns an empty byte array for the empty input", () => {
    expect(encodeFieldElements([]).length).toBe(0);
  });

  it("concatenates each element's 32-byte encoding", () => {
    const out = encodeFieldElements([0n, 1n]);
    expect(out.length).toBe(64);
    expect(out[31]).toBe(0);
    expect(out[63]).toBe(1);
  });
});
import { describe, it, expect } from "vitest";
import {
  fieldToBytes,
  encodeG1,
  encodeG2,
  encodeProof,
  encodeVerifyingKey,
  toHex,
} from "../src/groth16encode.js";

const be32 = (hex: string) => hex.padStart(64, "0");

describe("groth16encode", () => {
  it("encodes G1 as be(X)||be(Y), exactly 64 bytes", () => {
    const out = encodeG1(["1", "2"]);
    expect(out).toHaveLength(64);
    expect(toHex(out)).toBe(be32("01") + be32("02"));
    expect(toHex(out)).toHaveLength(128);
    expect(toHex(out)).toMatch(/^[0-9a-f]{128}$/);
  });

  it("encodes G2 imaginary-first, exactly 128 bytes", () => {
    const out = encodeG2([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(out).toHaveLength(128);
    expect(toHex(out)).toBe(be32("02") + be32("01") + be32("04") + be32("03"));
  });

  it("zero-pads small coordinates to a fixed width", () => {
    expect(encodeG1(["0", "0"])).toHaveLength(64);
    expect(encodeG2([["0", "0"], ["0", "0"]])).toHaveLength(128);
    expect(toHex(encodeG1(["0", "0"]))).toBe("0".repeat(128));
  });

  it("splits a proof into 64/128/64 byte groups", () => {
    const encoded = encodeProof({
      pi_a: ["1", "2"],
      pi_b: [
        ["3", "4"],
        ["5", "6"],
      ],
      pi_c: ["7", "8"],
    });
    expect(encoded.a).toHaveLength(64);
    expect(encoded.b).toHaveLength(128);
    expect(encoded.c).toHaveLength(64);
  });

  it("encodes every verifying-key group", () => {
    const vkey = encodeVerifyingKey({
      vk_alpha_1: ["1", "2"],
      vk_beta_2: [
        ["3", "4"],
        ["5", "6"],
      ],
      vk_gamma_2: [
        ["7", "8"],
        ["9", "10"],
      ],
      vk_delta_2: [
        ["11", "12"],
        ["13", "14"],
      ],
      IC: [
        ["1", "2"],
        ["3", "4"],
      ],
    });
    expect(vkey.alpha).toHaveLength(64);
    expect(vkey.beta).toHaveLength(128);
    expect(vkey.gamma).toHaveLength(128);
    expect(vkey.delta).toHaveLength(128);
    expect(vkey.ic.map((p) => p.length)).toEqual([64, 64]);
  });

  it("round-trips fieldToBytes through toHex", () => {
    expect(toHex(fieldToBytes("1"))).toBe(be32("01"));
    expect(toHex(fieldToBytes(1n))).toBe(toHex(fieldToBytes("1")));
  });
});
