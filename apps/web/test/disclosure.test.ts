// @vitest-environment node
import { describe, it, expect } from "vitest";
import { encryptDisclosure, decryptDisclosure } from "../lib/disclosure";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

describe("disclosure AES-GCM round-trip", () => {
  it("preserves a nested object with unicode and bigint-as-string", async () => {
    const data = {
      epoch: "42",
      onchainReserves: "850000000",
      holders: [
        { userId: "1", balance: "300000000", label: "Aurora ☂" },
        { userId: "2", balance: "200000000", label: "Meridian — ✓" },
      ],
    };
    const payload = await encryptDisclosure(data, "correct horse", "42");
    const out = await decryptDisclosure(payload, "correct horse");
    expect(out).toEqual(data);
  });

  it("rejects a different passphrase rather than returning garbage", async () => {
    const payload = await encryptDisclosure({ secret: "value" }, "right", "1");
    await expect(decryptDisclosure(payload, "wrong")).rejects.toBeTruthy();
  });

  it("emits base64 salt, iv and ct with a 12-byte IV", async () => {
    const payload = await encryptDisclosure({ a: 1 }, "k", "9");
    expect(payload.salt).toMatch(BASE64);
    expect(payload.iv).toMatch(BASE64);
    expect(payload.ct).toMatch(BASE64);
    expect(Buffer.from(payload.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(payload.salt, "base64")).toHaveLength(16);
    expect(payload.epoch).toBe("9");
  });

  it("uses a fresh IV for each encryption", async () => {
    const first = await encryptDisclosure({ a: 1 }, "k", "1");
    const second = await encryptDisclosure({ a: 1 }, "k", "1");
    expect(first.iv).not.toBe(second.iv);
  });
});
