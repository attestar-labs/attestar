import { describe, it, expect } from "vitest";
import { sumBase, sumBaseDetailed, type LedgerEntry } from "../lib/ledger";

const valid: LedgerEntry[] = [
  { userId: "1", balance: "30", label: "Aurora" },
  { userId: "2", balance: "20", label: "Meridian" },
];

describe("sumBaseDetailed", () => {
  it("totals every valid row and reports no rejections", () => {
    const result = sumBaseDetailed(valid);
    expect(result.total).toBe(500000000n);
    expect(result.rejected).toEqual([]);
  });

  it("reports an unparseable row and excludes it from the total", () => {
    const entries: LedgerEntry[] = [...valid, { userId: "3", balance: "1e3", label: "Broken" }];
    const result = sumBaseDetailed(entries);
    expect(result.total).toBe(500000000n);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ index: 2, label: "Broken" });
  });

  it("sumBase returns just the converted total", () => {
    const entries: LedgerEntry[] = [...valid, { userId: "3", balance: "nope", label: "Broken" }];
    expect(sumBase(entries)).toBe(500000000n);
  });
});
