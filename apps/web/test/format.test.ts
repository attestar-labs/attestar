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
