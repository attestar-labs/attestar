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


// A strict non-negative decimal: digits, then an optional fractional part.
// Signs, exponents, thousands separators and bare punctuation are rejected so a
// typo fails loudly instead of silently changing the proven liability total.
const USDC_AMOUNT_RE = /^\d+(\.\d+)?$/;

export function usdcToBase(v: string): bigint {
  const raw = (v ?? "").trim();
  if (!USDC_AMOUNT_RE.test(raw)) {
    throw new Error(`Invalid USDC amount: ${JSON.stringify(v)}`);
  }
  const [whole, frac = ""] = raw.split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded);
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
