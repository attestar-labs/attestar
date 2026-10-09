// The circuit range-checks every leaf balance with `Num2Bits(BITS)` (see
// packages/circuits/circuits/lib/solvency_tree.circom), so a witness is only
// satisfiable for balances in [0, 2^BITS). A ledger row that carries a value
// outside that window (for example a balance usdcToBase produced from a long
// digit string) passes every other client-side check and then makes snarkjs
// reject the witness with an opaque "Assert Failed" from inside the compiled
// circuit. We reject those values up front, naming the offending row.

export const BITS = 64;

/** Exclusive upper bound: 2^BITS. */
export const MAX_BALANCE = 1n << BigInt(BITS);

/**
 * Throws unless `balance` is a value the circuit can accept, i.e.
 * `0 <= balance < 2^64`. The message names the row and states `BITS = 64`.
 */
export function assertBalanceInRange(balance: bigint, row: number): void {
  if (balance < 0n) {
    throw new Error(
      `row ${row}: balance ${balance} is negative; the circuit range-checks every balance with ` +
        `Num2Bits(BITS) where BITS = 64, so balances must lie in [0, 2^64)`,
    );
  }
  if (balance >= MAX_BALANCE) {
    throw new Error(
      `row ${row}: balance ${balance} is >= 2^64; the circuit range-checks every balance with ` +
        `Num2Bits(BITS) where BITS = 64, so balances must lie in [0, 2^64)`,
    );
  }
}
