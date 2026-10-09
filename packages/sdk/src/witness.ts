import { assertLeafAmount } from "./errors.js";
import { assertBalanceInRange } from "./range.js";
import type { Holder, CircuitInput, PrivateCircuitInput } from "./types.js";

export function buildCircuitInput(holders: Holder[], depth: number): CircuitInput {
  const capacity = 1 << depth;
  if (holders.length > capacity) {
    throw new Error(`too many holders: ${holders.length} > capacity ${capacity}`);
  }
  // The circuit range-checks each balance with Num2Bits(BITS); reject values it
  // cannot accept here, naming the row, before snarkjs builds the witness.
  holders.forEach((h, i) => assertBalanceInRange(h.balance, i));
  const balances: string[] = [];
  const userIds: string[] = [];
  for (let i = 0; i < capacity; i++) {
    const h = holders[i];
    if (h) assertLeafAmount(h.balance, `holder ${h.userId.toString()}`);
    balances.push((h ? h.balance : 0n).toString());
    userIds.push((h ? h.userId : 0n).toString());
  }
  return { balances, userIds };
}

function padVector(items: Holder[], depth: number) {
  const capacity = 1 << depth;
  if (items.length > capacity) {
    throw new Error(`too many entries: ${items.length} > capacity ${capacity}`);
  }
  items.forEach((h, i) => assertBalanceInRange(h.balance, i));
  const balances: string[] = [];
  const userIds: string[] = [];
  for (let i = 0; i < capacity; i++) {
    const h = items[i];
    if (h) assertLeafAmount(h.balance, `source ${h.userId.toString()}`);
    balances.push((h ? h.balance : 0n).toString());
    userIds.push((h ? h.userId : 0n).toString());
  }
  return { balances, userIds };
}

export function buildPrivateInput(
  holders: Holder[],
  sources: Holder[],
  onchainReserves: bigint,
  liabDepth: number,
  resDepth: number,
): PrivateCircuitInput {
  const liab = padVector(holders, liabDepth);
  const res = padVector(sources, resDepth);
  return {
    balances: liab.balances,
    userIds: liab.userIds,
    reserves: res.balances,
    sourceIds: res.userIds,
    onchainReserves: onchainReserves.toString(),
  };
}
