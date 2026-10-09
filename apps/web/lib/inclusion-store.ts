"use client";

import { Buffer } from "buffer";
import { fieldToBytes, poseidon } from "@attestar/sdk";
import type { InclusionProof, SumNode } from "@attestar/sdk";

// Holder inclusion paths are persisted by the issuer's browser at proving time and
// read back by the holder's browser. Storing them (rather than rebuilding a tree
// from the current local ledger) is what makes the holder check meaningful: the
// path is folded and compared against the root the CHAIN recorded, so a tree the
// issuer never published cannot be mistaken for the proven one.
export const INCLUSION_KEY = "attestar:inclusions:v1";

export interface StoredInclusionProof {
  index: number;
  userId: string;
  balance: string;
  leafHash: string;
  siblings: { hash: string; sum: string }[];
  pathBits: number[];
  root: string;
  total: string;
}

export function toStoredProof(proof: InclusionProof): StoredInclusionProof {
  return {
    index: proof.index,
    userId: proof.userId.toString(),
    balance: proof.balance.toString(),
    leafHash: proof.leafHash.toString(),
    siblings: proof.siblings.map((s) => ({ hash: s.hash.toString(), sum: s.sum.toString() })),
    pathBits: [...proof.pathBits],
    root: proof.root.toString(),
    total: proof.total.toString(),
  };
}

export function fromStoredProof(stored: StoredInclusionProof): InclusionProof {
  return {
    index: stored.index,
    userId: BigInt(stored.userId),
    balance: BigInt(stored.balance),
    leafHash: BigInt(stored.leafHash),
    siblings: stored.siblings.map((s) => ({ hash: BigInt(s.hash), sum: BigInt(s.sum) })),
    pathBits: [...stored.pathBits],
    root: BigInt(stored.root),
    total: BigInt(stored.total),
  };
}

export function saveInclusionProofs(proofs: InclusionProof[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INCLUSION_KEY, JSON.stringify(proofs.map(toStoredProof)));
  } catch {
    // storage may be unavailable (private mode); the holder check degrades to
    // "no path stored" rather than crashing the issuer console.
  }
}

export function loadInclusionProofs(): StoredInclusionProof[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INCLUSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredInclusionProof[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadStoredProofForUser(userId: string | bigint): StoredInclusionProof | null {
  const want = userId.toString();
  return loadInclusionProofs().find((p) => p.userId === want) ?? null;
}

export function loadStoredProofAtIndex(index: number): StoredInclusionProof | null {
  return loadInclusionProofs().find((p) => p.index === index) ?? null;
}

export function bigintToHex32(value: bigint): string {
  return Buffer.from(fieldToBytes(value)).toString("hex");
}

export function hexToBigint(hex: string): bigint {
  return BigInt(/^0x/i.test(hex) ? hex : `0x${hex}`);
}

/**
 * Folds a stored Merkle-sum path exactly as `MerkleSumTree.verifyProof` does,
 * without rebuilding the tree from the current ledger. Returns the recomputed
 * node (hash + running sum).
 */
export async function foldStoredPath(stored: StoredInclusionProof): Promise<SumNode> {
  let hash = await poseidon([BigInt(stored.userId), BigInt(stored.balance)]);
  let sum = BigInt(stored.balance);
  for (let d = 0; d < stored.siblings.length; d++) {
    const sibling = stored.siblings[d];
    const sibHash = BigInt(sibling.hash);
    const sibSum = BigInt(sibling.sum);
    const isRight = !!stored.pathBits[d];
    const leftHash = isRight ? sibHash : hash;
    const leftSum = isRight ? sibSum : sum;
    const rightHash = isRight ? hash : sibHash;
    const rightSum = isRight ? sum : sibSum;
    hash = await poseidon([leftHash, leftSum, rightHash, rightSum]);
    sum = leftSum + rightSum;
  }
  return { hash, sum };
}

export interface StoredInclusionResult {
  /** The folded path lands exactly on the root the chain recorded. */
  ok: boolean;
  /** The path is internally consistent but commits to a different root than the chain has. */
  stale: boolean;
  /** The folded path does not even reproduce the root it was stored with. */
  tampered: boolean;
  balance: string;
  rootHex: string;
  chainRootHex: string | null;
}

/**
 * Verifies a stored inclusion path against the on-chain liabilities root.
 *
 * The result never depends on a locally rebuilt tree: it folds the persisted
 * path and compares the recomputed root with `chainRootHex` (the `liab_root` of
 * the latest on-chain attestation). A tampered path fails even when no
 * attestation exists; a path that folds to its own stored root but not to the
 * chain's is reported as stale.
 */
export async function verifyStoredInclusion(
  stored: StoredInclusionProof,
  chainRootHex: string | null,
): Promise<StoredInclusionResult> {
  const leafHash = await poseidon([BigInt(stored.userId), BigInt(stored.balance)]);
  const folded = await foldStoredPath(stored);
  const storedRoot = BigInt(stored.root);
  const pathIntact = leafHash === BigInt(stored.leafHash) && folded.hash === storedRoot;

  const chainRoot = chainRootHex ? hexToBigint(chainRootHex) : null;
  const ok = chainRoot !== null && pathIntact && folded.hash === chainRoot;
  const stale = pathIntact && chainRoot !== null && chainRoot !== storedRoot;
  const tampered = !pathIntact;

  return {
    ok,
    stale,
    tampered,
    balance: stored.balance,
    rootHex: bigintToHex32(storedRoot),
    chainRootHex,
  };
}
