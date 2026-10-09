import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_LEDGER,
  DEFAULT_SOURCES,
  loadLedger,
  loadSources,
  saveLedger,
  sumBase,
  toHolders,
  matchByAddress,
  type LedgerEntry,
} from "../lib/ledger";
import { usdcToBase } from "../lib/format";

describe("toHolders", () => {
  it("drops rows with a blank id or balance and preserves order", () => {
    const entries: LedgerEntry[] = [
      { userId: "3", balance: "15", label: "c" },
      { userId: "", balance: "9", label: "blank id" },
      { userId: "1", balance: "30", label: "a" },
      { userId: "2", balance: "", label: "blank balance" },
    ];
    expect(toHolders(entries)).toEqual([
      { userId: 3n, balance: usdcToBase("15") },
      { userId: 1n, balance: usdcToBase("30") },
    ]);
  });

  it("maps ids through BigInt and balances through usdcToBase", () => {
    const holders = toHolders(DEFAULT_LEDGER);
    expect(holders).toHaveLength(DEFAULT_LEDGER.length);
    expect(holders[0]).toEqual({ userId: 1n, balance: usdcToBase("30") });
    expect(holders[holders.length - 1]).toEqual({ userId: 5n, balance: usdcToBase("8") });
  });
});

describe("sumBase", () => {
  it("equals the sum of usdcToBase over every valid row", () => {
    const manual = DEFAULT_LEDGER.reduce((acc, row) => acc + usdcToBase(row.balance), 0n);
    expect(sumBase(DEFAULT_LEDGER)).toBe(manual);
    expect(sumBase(DEFAULT_LEDGER)).toBe(usdcToBase("85"));
  });

  it("is zero for an empty ledger", () => {
    expect(sumBase([])).toBe(0n);
  });
});

describe("matchByAddress", () => {
  const entries: LedgerEntry[] = [
    { userId: "1", balance: "30", label: "Aurora", address: "GAURORA" },
    { userId: "2", balance: "20", label: "Meridian" },
  ];

  it("returns the index of the matching row", () => {
    expect(matchByAddress(entries, "GAURORA")).toBe(0);
  });

  it("returns -1 when no row carries the address", () => {
    expect(matchByAddress(entries, "GUNKNOWN")).toBe(-1);
    expect(matchByAddress([{ userId: "3", balance: "1", label: "x" }], "G")).toBe(-1);
  });
});

describe("localStorage persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to the default ledger when nothing is stored", () => {
    expect(loadLedger()).toEqual(DEFAULT_LEDGER);
  });

  it("falls back when the stored JSON is not an array", () => {
    window.localStorage.setItem("attestar:ledger:v2", JSON.stringify({ oops: true }));
    expect(loadLedger()).toEqual(DEFAULT_LEDGER);
  });

  it("falls back when the stored value is corrupt", () => {
    window.localStorage.setItem("attestar:sources:v2", "{oops");
    expect(loadSources()).toEqual(DEFAULT_SOURCES);
  });

  it("round-trips a saved ledger", () => {
    const custom: LedgerEntry[] = [{ userId: "9", balance: "1.5", label: "z" }];
    saveLedger(custom);
    expect(loadLedger()).toEqual(custom);
  });
});
