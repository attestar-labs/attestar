// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { verifyingKey } from "@/lib/vkey-browser";
import vk from "@/lib/vk.json";

// apps/web/lib/vkey-browser.ts turns apps/web/lib/vk.json into the byte-shaped
// VerifyingKey the issuer console submits through set_verifier. groth16.rs
// documents the byte lengths: G1 = 64 bytes, G2 = 128 bytes, and
// ic.len() must equal (public signals) + 1 (four public signals here).
describe("verifyingKey decoding", () => {
  it("decodes alpha and delta to 64 bytes (G1)", () => {
    expect(verifyingKey.alpha).toHaveLength(64);
    expect(verifyingKey.delta).toHaveLength(64);
  });

  it("decodes beta and gamma to 128 bytes (G2)", () => {
    expect(verifyingKey.beta).toHaveLength(128);
    expect(verifyingKey.gamma).toHaveLength(128);
  });

  it("decodes exactly five ic entries of 64 bytes each", () => {
    expect(verifyingKey.ic).toHaveLength(5);
    for (const point of verifyingKey.ic) {
      expect(point).toHaveLength(64);
    }
  });

  it("decodes ic[0] to vk.json's first entry", () => {
    const expected = Buffer.from(vk.ic[0], "hex");
    expect(verifyingKey.ic[0].equals(expected)).toBe(true);
  });

  it("decodes every field to the bytes vk.json encodes", () => {
    expect(verifyingKey.alpha.equals(Buffer.from(vk.alpha, "hex"))).toBe(true);
    expect(verifyingKey.beta.equals(Buffer.from(vk.beta, "hex"))).toBe(true);
    expect(verifyingKey.gamma.equals(Buffer.from(vk.gamma, "hex"))).toBe(true);
    expect(verifyingKey.delta.equals(Buffer.from(vk.delta, "hex"))).toBe(true);
    verifyingKey.ic.forEach((point, i) => {
      expect(point.equals(Buffer.from(vk.ic[i], "hex"))).toBe(true);
    });
  });

  it("is pure: two imports produce deep-equal buffers", async () => {
    vi.resetModules();
    const second = (await import("@/lib/vkey-browser")).verifyingKey;

    // A fresh module instance, so the objects differ by identity ...
    expect(second).not.toBe(verifyingKey);
    // ... but decode to the same bytes.
    expect(second.alpha.equals(verifyingKey.alpha)).toBe(true);
    expect(second.beta.equals(verifyingKey.beta)).toBe(true);
    expect(second.gamma.equals(verifyingKey.gamma)).toBe(true);
    expect(second.delta.equals(verifyingKey.delta)).toBe(true);
    expect(second.ic).toHaveLength(verifyingKey.ic.length);
    second.ic.forEach((point, i) => {
      expect(point.equals(verifyingKey.ic[i])).toBe(true);
    });
  });
});
