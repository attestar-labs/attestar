export interface Holder {
  userId: bigint;
  balance: bigint;
}

export interface SumNode {
  hash: bigint;
  sum: bigint;
}

export interface InclusionProof {
  index: number;
  userId: bigint;
  balance: bigint;
  leafHash: bigint;
  siblings: SumNode[];
  pathBits: number[];
  depth: number;
  root: bigint;
  total: bigint;
}

export interface CircuitInput {
  balances: string[];
  userIds: string[];
}

export interface PrivateCircuitInput {
  balances: string[];
  userIds: string[];
  reserves: string[];
  sourceIds: string[];
  onchainReserves: string;
}
