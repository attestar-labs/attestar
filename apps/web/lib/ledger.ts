"use client";

import { StrKey } from "@stellar/stellar-sdk";
import type { Holder } from "@attestar/sdk";
import { usdcToBase } from "@/lib/format";

export interface LedgerEntry {
  userId: string;
  balance: string;
  label: string;
  address?: string;
}

const LEDGER_KEY = "attestar:ledger:v2";
const SOURCES_KEY = "attestar:sources:v2";

export const DEFAULT_LEDGER: LedgerEntry[] = [
  { userId: "1", balance: "30", label: "Aurora Capital" },
  { userId: "2", balance: "20", label: "Meridian Fund" },
  { userId: "3", balance: "15", label: "Vesper Holdings" },
  { userId: "4", balance: "12", label: "Lumen Partners" },
  { userId: "5", balance: "8", label: "Northwind LLC" },
];

export const DEFAULT_SOURCES: LedgerEntry[] = [
  { userId: "1", balance: "45", label: "BNY Mellon custody" },
  { userId: "2", balance: "25", label: "Treasury bills" },
];

function load(key: string, fallback: LedgerEntry[]): LedgerEntry[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as LedgerEntry[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, entries: LedgerEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(entries));
}

export const loadLedger = () => load(LEDGER_KEY, DEFAULT_LEDGER);
export const saveLedger = (e: LedgerEntry[]) => save(LEDGER_KEY, e);
export const loadSources = () => load(SOURCES_KEY, DEFAULT_SOURCES);
export const saveSources = (e: LedgerEntry[]) => save(SOURCES_KEY, e);

export function toHolders(entries: LedgerEntry[]): Holder[] {
  return entries
    .filter((h) => h.userId.trim() !== "" && h.balance.trim() !== "")
    .map((h) => ({ userId: BigInt(h.userId), balance: usdcToBase(h.balance) }));
}

export interface RejectedRow {
  index: number;
  label: string;
  balance: string;
  reason: string;
}

export interface SumResult {
  total: bigint;
  rejected: RejectedRow[];
}

// Totals the ledger while surfacing every row whose balance cannot be parsed,
// so a typo is reported to the caller instead of being silently dropped from the
// total the proof commits to.
export function sumBaseDetailed(entries: LedgerEntry[]): SumResult {
  let total = 0n;
  const rejected: RejectedRow[] = [];
  entries.forEach((h, index) => {
    try {
      total += usdcToBase(h.balance);
    } catch (e) {
      rejected.push({ index, label: h.label, balance: h.balance, reason: (e as Error).message });
    }
  });
  return { total, rejected };
}

export function sumBase(entries: LedgerEntry[]): bigint {
  return sumBaseDetailed(entries).total;
}

export function matchByAddress(entries: LedgerEntry[], address: string): number {
  return entries.findIndex((h) => h.address && h.address === address);
}
