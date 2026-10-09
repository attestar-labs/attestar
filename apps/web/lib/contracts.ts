"use client";

import { Client as Attestar } from "attestar-client";
import { Client as Token } from "usdc-client";

import { ATTESTAR_ID, TOKEN_ID, RPC_URL, NETWORK_PASSPHRASE, RESERVE_HOLDER } from "@/lib/config";

const PASS = NETWORK_PASSPHRASE;
const RPC = RPC_URL;
const READER = RESERVE_HOLDER;

type Signer = (
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
) => Promise<{ signedTxXdr: string; signerAddress?: string }>;

export function attestarSigner(publicKey: string, signTransaction: Signer) {
  return new Attestar({
    contractId: ATTESTAR_ID,
    networkPassphrase: PASS,
    rpcUrl: RPC,
    publicKey,
    signTransaction,
  });
}

export function tokenSigner(publicKey: string, signTransaction: Signer) {
  return new Token({
    contractId: TOKEN_ID,
    networkPassphrase: PASS,
    rpcUrl: RPC,
    publicKey,
    signTransaction,
  });
}

export function attestarReader(publicKey: string = READER) {
  return new Attestar({ contractId: ATTESTAR_ID, networkPassphrase: PASS, rpcUrl: RPC, publicKey });
}

// Reads the contract's real verifying-key state so the issuer console can decide
// whether the one-time setup panel is still needed. localStorage is only a cache.
export async function verifierIsSet(): Promise<boolean> {
  const tx = await attestarReader().verifier_is_set();
  return Boolean(tx.result);
}

export function tokenReader(publicKey: string = READER) {
  return new Token({ contractId: TOKEN_ID, networkPassphrase: PASS, rpcUrl: RPC, publicKey });
}

export const contractIds = { attestar: ATTESTAR_ID, token: TOKEN_ID, reserveHolder: READER };
