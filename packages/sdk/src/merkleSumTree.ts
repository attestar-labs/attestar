import { poseidon } from "./poseidon.js";
import { assertLeafAmount } from "./errors.js";
import type { Holder, SumNode, InclusionProof } from "./types.js";

const ZERO_HOLDER: Holder = { userId: 0n, balance: 0n };

async function leafNode(h: Holder): Promise<SumNode> {
  assertLeafAmount(h.balance, `holder ${h.userId.toString()}`);
  return { hash: await poseidon([h.userId, h.balance]), sum: h.balance };
}

async function parentNode(left: SumNode, right: SumNode): Promise<SumNode> {
  return {
    hash: await poseidon([left.hash, left.sum, right.hash, right.sum]),
    sum: left.sum + right.sum,
  };
}

export class MerkleSumTree {
  readonly depth: number;
  readonly capacity: number;
  readonly holders: Holder[];
  readonly levels: SumNode[][];

  private constructor(depth: number, holders: Holder[], levels: SumNode[][]) {
    this.depth = depth;
    this.capacity = 1 << depth;
    this.holders = holders;
    this.levels = levels;
  }

  static async build(holders: Holder[], depth: number): Promise<MerkleSumTree> {
    const capacity = 1 << depth;
    if (holders.length > capacity) {
      throw new Error(`too many holders: ${holders.length} > capacity ${capacity}`);
    }
    const padded: Holder[] = holders.slice();
    while (padded.length < capacity) padded.push(ZERO_HOLDER);

    const leaves = await Promise.all(padded.map(leafNode));
    const levels: SumNode[][] = [leaves];
    for (let d = 0; d < depth; d++) {
      const prev = levels[d];
      const next: SumNode[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        next.push(await parentNode(prev[i], prev[i + 1]));
      }
      levels.push(next);
    }
    return new MerkleSumTree(depth, padded, levels);
  }

  get root(): bigint {
    return this.levels[this.depth][0].hash;
  }

  get total(): bigint {
    return this.levels[this.depth][0].sum;
  }

  proofFor(index: number): InclusionProof {
    if (index < 0 || index >= this.capacity) {
      throw new Error(`index out of range: ${index}`);
    }
    const siblings: SumNode[] = [];
    const pathBits: number[] = [];
    let idx = index;
    for (let d = 0; d < this.depth; d++) {
      const isRight = idx & 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      siblings.push(this.levels[d][siblingIdx]);
      pathBits.push(isRight);
      idx >>= 1;
    }
    const leaf = this.levels[0][index];
    const holder = this.holders[index];
    return {
      index,
      userId: holder.userId,
      balance: holder.balance,
      leafHash: leaf.hash,
      siblings,
      pathBits,
      root: this.root,
      total: this.total,
    };
  }

  static async verifyProof(proof: InclusionProof): Promise<boolean> {
    let node: SumNode = {
      hash: await poseidon([proof.userId, proof.balance]),
      sum: proof.balance,
    };
    if (node.hash !== proof.leafHash) return false;
    for (let d = 0; d < proof.siblings.length; d++) {
      const sib = proof.siblings[d];
      node = proof.pathBits[d]
        ? await parentNode(sib, node)
        : await parentNode(node, sib);
    }
    return node.hash === proof.root && node.sum === proof.total;
  }
}
