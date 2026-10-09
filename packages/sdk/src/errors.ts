/**
 * The PrivateSolvency circuit range-checks every leaf amount with
 * `Num2Bits(64)`, so an amount must fit in an unsigned 64-bit integer:
 * `0 <= amount <= 2^64 - 1`. Values outside that range cannot appear in a
 * valid witness. We reject them with a typed error rather than let a
 * JavaScript `number` silently lose precision above `2^53`.
 */
export const MAX_LEAF_AMOUNT: bigint = (1n << 64n) - 1n;

/** Thrown when a leaf amount is negative or wider than 64 bits. */
export class LeafAmountRangeError extends Error {
  readonly value: bigint;
  readonly max: bigint;

  constructor(value: bigint, max: bigint = MAX_LEAF_AMOUNT) {
    super(
      `leaf amount ${value.toString()} is outside the circuit range 0..${max.toString()} (2^64 - 1)`,
    );
    this.name = "LeafAmountRangeError";
    this.value = value;
    this.max = max;
  }
}

/**
 * Enforces the circuit's leaf invariant. Amounts must be `bigint` — passing a
 * `number` is rejected outright so a lossy float can never enter a leaf or a
 * running total.
 */
export function assertLeafAmount(value: bigint, context = "leaf"): void {
  if (typeof value !== "bigint") {
    throw new TypeError(
      `${context} amount must be a bigint (got ${typeof value}); leaf amounts are 64-bit integers and must not use JavaScript number arithmetic`,
    );
  }
  if (value < 0n || value > MAX_LEAF_AMOUNT) {
    throw new LeafAmountRangeError(value);
  }
}
