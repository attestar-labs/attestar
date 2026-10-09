"use client";

import { Buffer } from "buffer";
import {
  MerkleSumTree,
  buildPrivateInput,
  encodeProof,
  fieldToBytes,
  type Holder,
  type InclusionProof,
} from "@attestar/sdk";

export const LIAB_DEPTH = 4;
export const RES_DEPTH = 3;

const WASM = "/circuit/psolvency_demo.wasm";
const ZKEY = "/circuit/psolvency_demo.zkey";

export type ProveStage = "tree" | "witness" | "proving" | "done";

// snarkjs emits public signals in the circuit's declared order. For
// PrivateSolvency that is [liab_root, res_root, solvent, onchain_reserves].
const PUBLIC_SIGNAL_COUNT = 4;

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Cross-checks the signals against the trees the browser actually built, so a
// rebuilt circuit with a different signal order cannot make the app submit a
// mismatched proof. Returns the solvent verdict from the same validated array.
export function checkPublicSignals(
  publicSignals: string[],
  liabRoot: bigint,
  resRoot: bigint,
  onchainReserves: bigint,
): boolean {
  if (!Array.isArray(publicSignals) || publicSignals.length !== PUBLIC_SIGNAL_COUNT) {
    throw new Error(
      `Unexpected public signal count: expected ${PUBLIC_SIGNAL_COUNT}, got ${
        publicSignals?.length ?? 0
      }`,
    );
  }
  if (!equalBytes(fieldToBytes(BigInt(publicSignals[0])), fieldToBytes(liabRoot))) {
    throw new Error("Circuit liabilities root public signal does not match the local liabilities tree");
  }
  if (!equalBytes(fieldToBytes(BigInt(publicSignals[1])), fieldToBytes(resRoot))) {
    throw new Error("Circuit reserves root public signal does not match the local reserves tree");
  }
  const signalOnchain = BigInt(publicSignals[3]);
  if (signalOnchain !== onchainReserves) {
    throw new Error(
      `Circuit on-chain reserves public signal (${signalOnchain}) does not match the supplied reserves (${onchainReserves})`,
    );
  }
  return publicSignals[2] === "1";
}

export interface PrivateProof {
  proof: { a: Buffer; b: Buffer; c: Buffer };
  liabRoot: Buffer;
  resRoot: Buffer;
  liabRootHex: string;
  resRootHex: string;
  solvent: boolean;
  // One Merkle-sum path per holder, in the same order as `holders`, so the
  // issuer can persist them for holders to verify against the on-chain root.
  inclusionProofs: InclusionProof[];
}

export async function proveSolvencyPrivate(
  holders: Holder[],
  sources: Holder[],
  onchainReserves: bigint,
  onStage?: (stage: ProveStage) => void,
): Promise<PrivateProof> {
  onStage?.("tree");
  const liabTree = await MerkleSumTree.build(holders, LIAB_DEPTH);
  const resTree = await MerkleSumTree.build(sources, RES_DEPTH);

  onStage?.("witness");
  const input = buildPrivateInput(holders, sources, onchainReserves, LIAB_DEPTH, RES_DEPTH);

  onStage?.("proving");
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);

  // Validate the proof's own public signals against the trees before we build
  // the transaction, and derive the verdict from the validated array.
  const solvent = checkPublicSignals(publicSignals, liabTree.root, resTree.root, onchainReserves);

  const enc = encodeProof(proof as Parameters<typeof encodeProof>[0]);
  const liabRootBytes = fieldToBytes(liabTree.root);
  const resRootBytes = fieldToBytes(resTree.root);
  const inclusionProofs = holders.map((_, i) => liabTree.proofFor(i));
  onStage?.("done");

  return {
    proof: {
      a: Buffer.from(enc.a),
      b: Buffer.from(enc.b),
      c: Buffer.from(enc.c),
    },
    liabRoot: Buffer.from(liabRootBytes),
    resRoot: Buffer.from(resRootBytes),
    liabRootHex: Buffer.from(liabRootBytes).toString("hex"),
    resRootHex: Buffer.from(resRootBytes).toString("hex"),
    solvent: publicSignals[2] === "1",
    inclusionProofs,
    solvent,
  };
}

export async function inclusionForBrowser(holders: Holder[], index: number) {
  const tree = await MerkleSumTree.build(holders, LIAB_DEPTH);
  const proof = tree.proofFor(index);
  const ok = await MerkleSumTree.verifyProof(proof);
  return {
    ok,
    rootHex: Buffer.from(fieldToBytes(tree.root)).toString("hex"),
    balance: proof.balance.toString(),
  };
}
