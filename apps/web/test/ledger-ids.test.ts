import { describe, it, expect } from "vitest";
import { toHolders } from "../lib/ledger";

const entry = (userId: string, balance = "10", label = "Row") => ({ userId, balance, label });

describe("toHolders holder ids", () => {
  it("converts valid ids including 0 and a large in-field value unchanged", () => {
    expect(toHolders([entry("0"), entry("123456789")])).toEqual([
      { userId: 0n, balance: 100000000n },
      { userId: 123456789n, balance: 100000000n },
    ]);
  });

  it("rejects a non-numeric id and names the row before proving", () => {
    expect(() => toHolders([entry("1"), entry("abc", "10", "Aurora")])).toThrow(/Aurora/);
  });

  it("rejects a negative id", () => {
    expect(() => toHolders([entry("-1")])).toThrow(/non-negative/);
  });
});
