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
