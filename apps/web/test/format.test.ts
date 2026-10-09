import { describe, it, expect } from "vitest";
import { usdcToBase } from "../lib/format";

describe("usdcToBase", () => {
  it("rejects a negative amount instead of dropping the sign", () => {
    expect(() => usdcToBase("-5")).toThrow(/Invalid USDC amount/);
  });

  it("rejects scientific notation", () => {
    expect(() => usdcToBase("1e3")).toThrow(/Invalid USDC amount/);
  });

  it("rejects a thousands separator", () => {
    expect(() => usdcToBase("1,5")).toThrow(/Invalid USDC amount/);
  });

  it("rejects bare punctuation", () => {
    expect(() => usdcToBase("..")).toThrow(/Invalid USDC amount/);
  });

  it("converts valid amounts exactly as before", () => {
    expect(usdcToBase("0")).toBe(0n);
    expect(usdcToBase("0.0000001")).toBe(1n);
    expect(usdcToBase("30.5")).toBe(305000000n);
  });
});
