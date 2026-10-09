import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH",
  }
} as const

export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"AlreadyInitialized"},
  3: {message:"VerifierNotSet"},
  4: {message:"InvalidProof"},
  5: {message:"EpochExists"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "ReserveToken", values: void} | {tag: "ReserveHolder", values: void} | {tag: "Attestor", values: void} | {tag: "Vk", values: void} | {tag: "LatestEpoch", values: void} | {tag: "Attestation", values: readonly [u64]};


export interface Attestation {
  epoch: u64;
  liab_root: Buffer;
  onchain_reserves: i128;
  res_root: Buffer;
  solvent: boolean;
  timestamp: u64;
}



export interface Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}


export interface VerifyingKey {
  alpha: Buffer;
  beta: Buffer;
  delta: Buffer;
  gamma: Buffer;
  ic: Array<Buffer>;
}

export interface Client {
  /**
   * Construct and simulate a latest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  latest: (options?: MethodOptions) => Promise<AssembledTransaction<Option<Attestation>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, reserve_token, reserve_holder, attestor}: {admin: string, reserve_token: string, reserve_holder: string, attestor: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_solvent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_solvent: ({epoch}: {epoch: u64}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_verifier: ({vk}: {vk: VerifyingKey}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a verify_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify_proof: ({vk, proof, public_inputs}: {vk: VerifyingKey, proof: Proof, public_inputs: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a get_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_attestation: ({epoch}: {epoch: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Attestation>>>

  /**
   * Construct and simulate a submit_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  submit_attestation: ({epoch, proof, liab_root, res_root, solvent, res_sig}: {epoch: u64, proof: Proof, liab_root: Buffer, res_root: Buffer, solvent: boolean, res_sig: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Attestation>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAOVmVyaWZpZXJOb3RTZXQAAAAAAAMAAAAAAAAADEludmFsaWRQcm9vZgAAAAQAAAAAAAAAC0Vwb2NoRXhpc3RzAAAAAAU=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUmVzZXJ2ZVRva2VuAAAAAAAAAAAAAAANUmVzZXJ2ZUhvbGRlcgAAAAAAAAAAAAAAAAAACEF0dGVzdG9yAAAAAAAAAAAAAAACVmsAAAAAAAAAAAAAAAAAC0xhdGVzdEVwb2NoAAAAAAEAAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAEAAAAG",
        "AAAAAQAAAAAAAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAYAAAAAAAAABWVwb2NoAAAAAAAABgAAAAAAAAAJbGlhYl9yb290AAAAAAAD7gAAACAAAAAAAAAAEG9uY2hhaW5fcmVzZXJ2ZXMAAAALAAAAAAAAAAhyZXNfcm9vdAAAA+4AAAAgAAAAAAAAAAdzb2x2ZW50AAAAAAEAAAAAAAAACXRpbWVzdGFtcAAAAAAAAAY=",
        "AAAAAAAAAAAAAAAGbGF0ZXN0AAAAAAAAAAAAAQAAA+gAAAfQAAAAC0F0dGVzdGF0aW9uAA==",
        "AAAABQAAAAAAAAAAAAAAEUF0dGVzdGF0aW9uUG9zdGVkAAAAAAAAAQAAABJhdHRlc3RhdGlvbl9wb3N0ZWQAAAAAAAMAAAAAAAAABWVwb2NoAAAAAAAABgAAAAEAAAAAAAAAB3NvbHZlbnQAAAAAAQAAAAAAAAAAAAAAEG9uY2hhaW5fcmVzZXJ2ZXMAAAALAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAA1yZXNlcnZlX3Rva2VuAAAAAAAAEwAAAAAAAAAOcmVzZXJ2ZV9ob2xkZXIAAAAAABMAAAAAAAAACGF0dGVzdG9yAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAKaXNfc29sdmVudAAAAAAAAQAAAAAAAAAFZXBvY2gAAAAAAAAGAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAACdmsAAAAAB9AAAAAMVmVyaWZ5aW5nS2V5AAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAMdmVyaWZ5X3Byb29mAAAAAwAAAAAAAAACdmsAAAAAB9AAAAAMVmVyaWZ5aW5nS2V5AAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAAAAAAADXB1YmxpY19pbnB1dHMAAAAAAAPqAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAAPZ2V0X2F0dGVzdGF0aW9uAAAAAAEAAAAAAAAABWVwb2NoAAAAAAAABgAAAAEAAAPoAAAH0AAAAAtBdHRlc3RhdGlvbgA=",
        "AAAAAAAAAAAAAAASc3VibWl0X2F0dGVzdGF0aW9uAAAAAAAGAAAAAAAAAAVlcG9jaAAAAAAAAAYAAAAAAAAABXByb29mAAAAAAAH0AAAAAVQcm9vZgAAAAAAAAAAAAAJbGlhYl9yb290AAAAAAAD7gAAACAAAAAAAAAACHJlc19yb290AAAD7gAAACAAAAAAAAAAB3NvbHZlbnQAAAAAAQAAAAAAAAAHcmVzX3NpZwAAAAPuAAAAQAAAAAEAAAPpAAAH0AAAAAtBdHRlc3RhdGlvbgAAAAAD",
        "AAAAAQAAAAAAAAAAAAAABVByb29mAAAAAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==",
        "AAAAAQAAAAAAAAAAAAAADFZlcmlmeWluZ0tleQAAAAUAAAAAAAAABWFscGhhAAAAAAAD7gAAAEAAAAAAAAAABGJldGEAAAPuAAAAgAAAAAAAAAAFZGVsdGEAAAAAAAPuAAAAgAAAAAAAAAAFZ2FtbWEAAAAAAAPuAAAAgAAAAAAAAAACaWMAAAAAA+oAAAPuAAAAQA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    latest: this.txFromJSON<Option<Attestation>>,
        initialize: this.txFromJSON<Result<void>>,
        is_solvent: this.txFromJSON<boolean>,
        set_verifier: this.txFromJSON<Result<void>>,
        verify_proof: this.txFromJSON<boolean>,
        get_attestation: this.txFromJSON<Option<Attestation>>,
        submit_attestation: this.txFromJSON<Result<Attestation>>
  }
}