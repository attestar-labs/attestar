import { describe, it, expect } from "vitest";
import { baseToUsdc, fmtAmount, usdcToBase } from "../lib/format";

describe("usdcToBase / baseToUsdc round-trips", () => {
  it("round-trips whole amounts", () => {
    expect(baseToUsdc(usdcToBase("30"))).toBe("30");
  });

  it("round-trips fractional amounts", () => {
    expect(baseToUsdc(usdcToBase("30.5"))).toBe("30.5");
  });

  it("round-trips the smallest supported unit", () => {
    expect(baseToUsdc(usdcToBase("0.0000001"))).toBe("0.0000001");
  });
});

describe("usdcToBase fractional handling", () => {
  it("truncates digits beyond USDC_DECIMALS instead of rounding up", () => {
    expect(usdcToBase("1.12345678")).toBe(11234567n);
    expect(usdcToBase("0.99999999")).toBe(9999999n);
  });

  it("pads a short fraction up to the base unit", () => {
    expect(usdcToBase("1.5")).toBe(15000000n);
    expect(usdcToBase("30")).toBe(300000000n);
  });
});

describe("null and undefined fallbacks", () => {
  it("returns an em dash from fmtAmount", () => {
    expect(fmtAmount(null)).toBe("—");
    expect(fmtAmount(undefined)).toBe("—");
  });

  it("returns an em dash from baseToUsdc", () => {
    expect(baseToUsdc(null)).toBe("—");
    expect(baseToUsdc(undefined)).toBe("—");
  });

  it("formats a base amount with thousands separators", () => {
    expect(fmtAmount(300000000n)).toBe("300,000,000");
  });
});
import { describe, it, expect } from "vitest";
import { fmtAmount, baseToUsdc } from "../lib/format";

// 2^53 + 1 — the first integer a JavaScript number cannot represent exactly.
const ABOVE_SAFE = 9007199254740993n;

describe("format totals above Number.MAX_SAFE_INTEGER", () => {
  it("fmtAmount renders the exact value", () => {
    expect(fmtAmount(ABOVE_SAFE)).toBe("9,007,199,254,740,993");
  });

  it("baseToUsdc renders base units exactly", () => {
    expect(baseToUsdc(ABOVE_SAFE)).toBe("900,719,925.4740993");
  });
});
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
