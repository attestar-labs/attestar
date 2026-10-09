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
