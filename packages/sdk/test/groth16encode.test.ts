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
