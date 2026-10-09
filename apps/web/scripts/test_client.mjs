// End-to-end smoke test against a live Attestar deployment.
//
// Builds the private solvency witness with the same SDK helpers and the same
// `psolvency_demo` artifacts the browser prover uses, then submits an
// attestation through the generated `attestar-client`. Every method and argument
// name below exists in packages/attestar-client/src/index.ts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client as Attestar } from "attestar-client";
import { Client as Token } from "usdc-client";
import {
  MerkleSumTree,
  buildPrivateInput,
  encodeProof,
  fieldToBytes,
} from "@attestar/sdk";

const LIAB_DEPTH = 4;
const RES_DEPTH = 3;

const required = [
  "NEXT_PUBLIC_NETWORK_PASSPHRASE",
  "NEXT_PUBLIC_RPC_URL",
  "ISSUER_SECRET",
  "ATTESTAR_ID",
  "TOKEN_ID",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment: ${missing.join(", ")}`);
  console.error("Set these to the testnet deployment values before running.");
  process.exit(1);
}

const PASS = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;
const RPC = process.env.NEXT_PUBLIC_RPC_URL;
const kp = Keypair.fromSecret(process.env.ISSUER_SECRET);
const signer = basicNodeSigner(kp, PASS);
const opts = (id) => ({
  contractId: id,
  networkPassphrase: PASS,
  rpcUrl: RPC,
  publicKey: kp.publicKey(),
  signTransaction: signer.signTransaction,
});

const att = new Attestar(opts(process.env.ATTESTAR_ID));
const tok = new Token(opts(process.env.TOKEN_ID));

// The contract substitutes the configured reserve holder's real balance as the
// fourth public input, so the proof must commit to that exact figure.
const reserveHolder = process.env.RESERVE_HOLDER || kp.publicKey();

const latest = (await att.latest()).result;
console.log("latest before:", latest);

const onchainReserves = BigInt((await tok.balance({ id: reserveHolder })).result);
console.log("reserve balance:", onchainReserves);

const holders = [
  { userId: 1n, balance: 300000n },
  { userId: 2n, balance: 200000n },
  { userId: 3n, balance: 150000n },
];
const sources = [
  { userId: 1n, balance: 400000n },
  { userId: 2n, balance: 250000n },
];

const liabTree = await MerkleSumTree.build(holders, LIAB_DEPTH);
const resTree = await MerkleSumTree.build(sources, RES_DEPTH);
const input = buildPrivateInput(holders, sources, onchainReserves, LIAB_DEPTH, RES_DEPTH);

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "circuits",
  "build",
  "psolvency_demo",
);
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  path.join(DIR, "psolvency_demo_js", "psolvency_demo.wasm"),
  path.join(DIR, "psolvency_demo.zkey"),
);

const enc = encodeProof(proof);
const solvent = publicSignals[2] === "1";
const epoch = latest ? BigInt(latest.epoch) + 1n : 1n;
console.log("submitting epoch", epoch, "liab total", liabTree.total, "solvent", solvent);

function u64ToBytes(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value));
  return out;
}

// Optional custodian signature: when the deployment has an attestor set, the
// off-chain reserve commitment must be signed over (epoch || res_root). With no
// CUSTODIAN_SECRET we send a zero signature; the contract skips the check only
// when its attestor is the zero key.
let resSig = Buffer.alloc(64);
if (process.env.CUSTODIAN_SECRET) {
  const custodian = Keypair.fromSecret(process.env.CUSTODIAN_SECRET);
  const msg = Buffer.concat([u64ToBytes(epoch), Buffer.from(fieldToBytes(resTree.root))]);
  resSig = custodian.sign(msg);
}

const tx = await att.submit_attestation({
  epoch,
  proof: { a: Buffer.from(enc.a), b: Buffer.from(enc.b), c: Buffer.from(enc.c) },
  liab_root: Buffer.from(fieldToBytes(liabTree.root)),
  res_root: Buffer.from(fieldToBytes(resTree.root)),
  solvent,
  res_sig: resSig,
});
const sent = await tx.signAndSend();
console.log("submit hash:", sent.sendTransactionResponse?.hash);

const latest2 = (await att.latest()).result;
console.log("latest after:", latest2);
