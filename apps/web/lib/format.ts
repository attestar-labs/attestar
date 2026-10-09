import { USDC_DECIMALS } from "@/lib/config";

export function fmtAmount(v: string | bigint | null | undefined): string {
  if (v === null || v === undefined) return "—";
  try {
    return BigInt(v).toLocaleString("en-US");
  } catch {
    return String(v);
  }
}

export function shortHash(hex: string | null | undefined, n = 6): string {
  if (!hex) return "—";
  return hex.length <= n * 2 ? hex : `${hex.slice(0, n)}…${hex.slice(-n)}`;
}

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://stellar.expert/explorer/testnet";

export function explorerTx(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerContract(id: string): string {
  return `${EXPLORER}/contract/${id}`;
}


export function usdcToBase(v: string): bigint {
  const [whole, frac = ""] = (v || "0").trim().split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  const w = whole.replace(/[^0-9]/g, "") || "0";
  const f = fracPadded.replace(/[^0-9]/g, "") || "0";
  return BigInt(w) * 10n ** BigInt(USDC_DECIMALS) + BigInt(f);
}

export function baseToUsdc(v: string | bigint | null | undefined): string {
  if (v === null || v === undefined) return "—";
  let b: bigint;
  try {
    b = BigInt(v);
  } catch {
    return String(v);
  }
  const neg = b < 0n;
  if (neg) b = -b;
  const base = 10n ** BigInt(USDC_DECIMALS);
  const whole = b / base;
  const frac = (b % base).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? "." + frac : ""}`;
}
