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
    contractId: "CDLLLW75DCVY5KH7T656O6CBVDJEH3WUSXSOZIOCQM6G32AMEBPNBI2Q",
  }
} as const

export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"AlreadyInitialized"},
  3: {message:"VerifierNotSet"},
  4: {message:"InvalidProof"},
  5: {message:"EpochExists"},
  6: {message:"Unauthorized"},
  7: {message:"UnknownAttestor"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "ReserveToken", values: void} | {tag: "ReserveHolder", values: void} | {tag: "Attestor", values: void} | {tag: "PrevAttestor", values: void} | {tag: "Vk", values: void} | {tag: "LatestEpoch", values: void} | {tag: "Attestation", values: readonly [u64]};


export interface Attestation {
  epoch: u64;
  liab_root: Buffer;
  onchain_reserves: i128;
  res_root: Buffer;
  solvent: boolean;
  timestamp: u64;
  /**
 * Schema version of this record; see [`ATTESTATION_VERSION`].
 */
version: u32;
}


/**
 * The layout written before records carried a `version` tag. Records in this
 * shape are still readable; see [`AttestarContract::load_attestation`].
 * 
 * Kept as a type so the pre-upgrade layout stays documented (and so tests can
 * write one), but it is never produced any more.
 */
export interface AttestationV1 {
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
   * Construct and simulate a verifier_is_set transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verifier_is_set: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

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
   * Construct and simulate a rotate_attestor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rotates the reserve-signature attestor. `new_attestor` becomes the key
   * that signs new publications and the key it replaces is retained as the
   * overlap key, so publications signed by either key are accepted until
   * [`Self::end_attestor_overlap`] is called. Only the stored admin may
   * rotate; anyone else gets [`Error::Unauthorized`].
   */
  rotate_attestor: ({caller, new_attestor}: {caller: string, new_attestor: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a submit_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  submit_attestation: ({epoch, proof, liab_root, res_root, solvent, res_sig}: {epoch: u64, proof: Proof, liab_root: Buffer, res_root: Buffer, solvent: boolean, res_sig: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Attestation>>>

  /**
   * Construct and simulate a end_attestor_overlap transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Closes the overlap window early, retiring the previous attestor so only
   * the current key is accepted from now on.
   */
  end_attestor_overlap: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a submit_attestation_signed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Same as [`Self::submit_attestation`], but the custodian states which of
   * the registered attestor keys produced `res_sig`. This is what makes a
   * rotation with an overlap window usable: while the window is open, a
   * signature from either the current or the previous key verifies.
   */
  submit_attestation_signed: ({epoch, proof, liab_root, res_root, solvent, res_signer, res_sig}: {epoch: u64, proof: Proof, liab_root: Buffer, res_root: Buffer, solvent: boolean, res_signer: Buffer, res_sig: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Attestation>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAOVmVyaWZpZXJOb3RTZXQAAAAAAAMAAAAAAAAADEludmFsaWRQcm9vZgAAAAQAAAAAAAAAC0Vwb2NoRXhpc3RzAAAAAAUAAAAAAAAADFVuYXV0aG9yaXplZAAAAAYAAAAAAAAAD1Vua25vd25BdHRlc3RvcgAAAAAH",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUmVzZXJ2ZVRva2VuAAAAAAAAAAAAAAANUmVzZXJ2ZUhvbGRlcgAAAAAAAAAAAAAAAAAACEF0dGVzdG9yAAAAAAAAAMNUaGUga2V5IHRoYXQgd2FzIGN1cnJlbnQgYmVmb3JlIHRoZSBtb3N0IHJlY2VudCByb3RhdGlvbi4gSXQgc3RheXMKYWNjZXB0ZWQgdW50aWwgdGhlIG92ZXJsYXAgd2luZG93IGlzIGNsb3NlZCwgc28gYSBjdXN0b2RpYW4gdGhhdCBoYXMgbm90CnlldCBzd2l0Y2hlZCBvdmVyIGNhbiBzdGlsbCBwdWJsaXNoIHZhbGlkIGF0dGVzdGF0aW9ucy4AAAAADFByZXZBdHRlc3RvcgAAAAAAAAAAAAAAAlZrAAAAAAAAAAAAAAAAAAtMYXRlc3RFcG9jaAAAAAABAAAAAAAAAAtBdHRlc3RhdGlvbgAAAAABAAAABg==",
        "AAAAAQAAAAAAAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAYAAAAAAAAABWVwb2NoAAAAAAAABgAAAAAAAAAJbGlhYl9yb290AAAAAAAD7gAAACAAAAAAAAAAEG9uY2hhaW5fcmVzZXJ2ZXMAAAALAAAAAAAAAAhyZXNfcm9vdAAAA+4AAAAgAAAAAAAAAAdzb2x2ZW50AAAAAAEAAAAAAAAACXRpbWVzdGFtcAAAAAAAAAY=",
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAOVmVyaWZpZXJOb3RTZXQAAAAAAAMAAAAAAAAADEludmFsaWRQcm9vZgAAAAQAAAAAAAAAC0Vwb2NoRXhpc3RzAAAAAAU=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUmVzZXJ2ZVRva2VuAAAAAAAAAAAAAAANUmVzZXJ2ZUhvbGRlcgAAAAAAAAAAAAAAAAAACEF0dGVzdG9yAAAAAAAAAAAAAAACVmsAAAAAAAAAAAAAAAAAC0xhdGVzdEVwb2NoAAAAAAEAAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAEAAAAG",
        "AAAAAQAAAAAAAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAcAAAAAAAAABWVwb2NoAAAAAAAABgAAAAAAAAAJbGlhYl9yb290AAAAAAAD7gAAACAAAAAAAAAAEG9uY2hhaW5fcmVzZXJ2ZXMAAAALAAAAAAAAAAhyZXNfcm9vdAAAA+4AAAAgAAAAAAAAAAdzb2x2ZW50AAAAAAEAAAAAAAAACXRpbWVzdGFtcAAAAAAAAAYAAAAAAAAAB3ZlcnNpb24AAAAABA==",
        "AAAAAAAAAAAAAAAGbGF0ZXN0AAAAAAAAAAAAAQAAA+gAAAfQAAAAC0F0dGVzdGF0aW9uAA==",
        "AAAABQAAAAAAAAAAAAAAEUF0dGVzdGF0aW9uUG9zdGVkAAAAAAAAAQAAABJhdHRlc3RhdGlvbl9wb3N0ZWQAAAAAAAMAAAAAAAAABWVwb2NoAAAAAAAABgAAAAEAAAAAAAAAB3NvbHZlbnQAAAAAAQAAAAAAAAAAAAAAEG9uY2hhaW5fcmVzZXJ2ZXMAAAALAAAAAAAAAAI=",
        "AAAABQAAAHlFbWl0dGVkIHdoZW4gdGhlIHJlc2VydmUtc2lnbmF0dXJlIGF0dGVzdG9yIGlzIHJvdGF0ZWQuIGBwcmV2aW91c2AgaXMga2VwdAphcyB0aGUgb3ZlcmxhcCBrZXkgdW50aWwgdGhlIHdpbmRvdyBpcyBjbG9zZWQuAAAAAAAAAAAAAA9BdHRlc3RvclJvdGF0ZWQAAAAAAQAAABBhdHRlc3Rvcl9yb3RhdGVkAAAAAgAAAAAAAAAHY3VycmVudAAAAAPuAAAAIAAAAAEAAAAAAAAACHByZXZpb3VzAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAERFbWl0dGVkIHdoZW4gdGhlIG92ZXJsYXAgd2luZG93IGlzIGNsb3NlZCBlYXJseSwgcmV0aXJpbmcgYHJldGlyZWRgLgAAAAAAAAAUQXR0ZXN0b3JPdmVybGFwRW5kZWQAAAABAAAAFmF0dGVzdG9yX292ZXJsYXBfZW5kZWQAAAAAAAEAAAAAAAAAB3JldGlyZWQAAAAD7gAAACAAAAABAAAAAg==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAA1yZXNlcnZlX3Rva2VuAAAAAAAAEwAAAAAAAAAOcmVzZXJ2ZV9ob2xkZXIAAAAAABMAAAAAAAAACGF0dGVzdG9yAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAKaXNfc29sdmVudAAAAAAAAQAAAAAAAAAFZXBvY2gAAAAAAAAGAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAACdmsAAAAAB9AAAAAMVmVyaWZ5aW5nS2V5AAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAMdmVyaWZ5X3Byb29mAAAAAwAAAAAAAAACdmsAAAAAB9AAAAAMVmVyaWZ5aW5nS2V5AAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAAAAAAADXB1YmxpY19pbnB1dHMAAAAAAAPqAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAAPZ2V0X2F0dGVzdGF0aW9uAAAAAAEAAAAAAAAABWVwb2NoAAAAAAAABgAAAAEAAAPoAAAH0AAAAAtBdHRlc3RhdGlvbgA=",
        "AAAAAAAAAAAAAAASc3VibWl0X2F0dGVzdGF0aW9uAAAAAAAGAAAAAAAAAAVlcG9jaAAAAAAAAAYAAAAAAAAABXByb29mAAAAAAAH0AAAAAVQcm9vZgAAAAAAAAAAAAAJbGlhYl9yb290AAAAAAAD7gAAACAAAAAAAAAACHJlc19yb290AAAD7gAAACAAAAAAAAAAB3NvbHZlbnQAAAAAAQAAAAAAAAAHcmVzX3NpZwAAAAPuAAAAQAAAAAEAAAPpAAAH0AAAAAtBdHRlc3RhdGlvbgAAAAAD",
        "AAAAAAAAAUhSb3RhdGVzIHRoZSByZXNlcnZlLXNpZ25hdHVyZSBhdHRlc3Rvci4gYG5ld19hdHRlc3RvcmAgYmVjb21lcyB0aGUga2V5CnRoYXQgc2lnbnMgbmV3IHB1YmxpY2F0aW9ucyBhbmQgdGhlIGtleSBpdCByZXBsYWNlcyBpcyByZXRhaW5lZCBhcyB0aGUKb3ZlcmxhcCBrZXksIHNvIHB1YmxpY2F0aW9ucyBzaWduZWQgYnkgZWl0aGVyIGtleSBhcmUgYWNjZXB0ZWQgdW50aWwKW2BTZWxmOjplbmRfYXR0ZXN0b3Jfb3ZlcmxhcGBdIGlzIGNhbGxlZC4gT25seSB0aGUgc3RvcmVkIGFkbWluIG1heQpyb3RhdGU7IGFueW9uZSBlbHNlIGdldHMgW2BFcnJvcjo6VW5hdXRob3JpemVkYF0uAAAAD3JvdGF0ZV9hdHRlc3RvcgAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAADG5ld19hdHRlc3RvcgAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAHBDbG9zZXMgdGhlIG92ZXJsYXAgd2luZG93IGVhcmx5LCByZXRpcmluZyB0aGUgcHJldmlvdXMgYXR0ZXN0b3Igc28gb25seQp0aGUgY3VycmVudCBrZXkgaXMgYWNjZXB0ZWQgZnJvbSBub3cgb24uAAAAFGVuZF9hdHRlc3Rvcl9vdmVybGFwAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAARFTYW1lIGFzIFtgU2VsZjo6c3VibWl0X2F0dGVzdGF0aW9uYF0sIGJ1dCB0aGUgY3VzdG9kaWFuIHN0YXRlcyB3aGljaCBvZgp0aGUgcmVnaXN0ZXJlZCBhdHRlc3RvciBrZXlzIHByb2R1Y2VkIGByZXNfc2lnYC4gVGhpcyBpcyB3aGF0IG1ha2VzIGEKcm90YXRpb24gd2l0aCBhbiBvdmVybGFwIHdpbmRvdyB1c2FibGU6IHdoaWxlIHRoZSB3aW5kb3cgaXMgb3BlbiwgYQpzaWduYXR1cmUgZnJvbSBlaXRoZXIgdGhlIGN1cnJlbnQgb3IgdGhlIHByZXZpb3VzIGtleSB2ZXJpZmllcy4AAAAAAAAZc3VibWl0X2F0dGVzdGF0aW9uX3NpZ25lZAAAAAAAAAcAAAAAAAAABWVwb2NoAAAAAAAABgAAAAAAAAAFcHJvb2YAAAAAAAfQAAAABVByb29mAAAAAAAAAAAAAAlsaWFiX3Jvb3QAAAAAAAPuAAAAIAAAAAAAAAAIcmVzX3Jvb3QAAAPuAAAAIAAAAAAAAAAHc29sdmVudAAAAAABAAAAAAAAAApyZXNfc2lnbmVyAAAAAAPuAAAAIAAAAAAAAAAHcmVzX3NpZwAAAAPuAAAAQAAAAAEAAAPpAAAH0AAAAAtBdHRlc3RhdGlvbgAAAAAD",
        "AAAAAQAAAAAAAAAAAAAABVByb29mAAAAAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==",
        "AAAAAQAAAAAAAAAAAAAADFZlcmlmeWluZ0tleQAAAAUAAAAAAAAABWFscGhhAAAAAAAD7gAAAEAAAAAAAAAABGJldGEAAAPuAAAAgAAAAAAAAAAFZGVsdGEAAAAAAAPuAAAAgAAAAAAAAAAFZ2FtbWEAAAAAAAPuAAAAgAAAAAAAAAACaWMAAAAAA+oAAAPuAAAAQA==",
        "AAAAAAAAAAAAAAAPdmVyaWZpZXJfaXNfc2V0AAAAAAAAAAABAAAAAQ==" ]),
        "AAAAAQAAAQxUaGUgbGF5b3V0IHdyaXR0ZW4gYmVmb3JlIHJlY29yZHMgY2FycmllZCBhIGB2ZXJzaW9uYCB0YWcuIFJlY29yZHMgaW4gdGhpcwpzaGFwZSBhcmUgc3RpbGwgcmVhZGFibGU7IHNlZSBbYEF0dGVzdGFyQ29udHJhY3Q6OmxvYWRfYXR0ZXN0YXRpb25gXS4KCktlcHQgYXMgYSB0eXBlIHNvIHRoZSBwcmUtdXBncmFkZSBsYXlvdXQgc3RheXMgZG9jdW1lbnRlZCAoYW5kIHNvIHRlc3RzIGNhbgp3cml0ZSBvbmUpLCBidXQgaXQgaXMgbmV2ZXIgcHJvZHVjZWQgYW55IG1vcmUuAAAAAAAAAA1BdHRlc3RhdGlvblYxAAAAAAAABgAAAAAAAAAFZXBvY2gAAAAAAAAGAAAAAAAAAAlsaWFiX3Jvb3QAAAAAAAPuAAAAIAAAAAAAAAAQb25jaGFpbl9yZXNlcnZlcwAAAAsAAAAAAAAACHJlc19yb290AAAD7gAAACAAAAAAAAAAB3NvbHZlbnQAAAAAAQAAAAAAAAAJdGltZXN0YW1wAAAAAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    latest: this.txFromJSON<Option<Attestation>>,
        verifier_is_set: this.txFromJSON<boolean>,
        initialize: this.txFromJSON<Result<void>>,
        is_solvent: this.txFromJSON<boolean>,
        set_verifier: this.txFromJSON<Result<void>>,
        verify_proof: this.txFromJSON<boolean>,
        get_attestation: this.txFromJSON<Option<Attestation>>,
        rotate_attestor: this.txFromJSON<Result<void>>,
        submit_attestation: this.txFromJSON<Result<Attestation>>,
        end_attestor_overlap: this.txFromJSON<Result<void>>,
        submit_attestation_signed: this.txFromJSON<Result<Attestation>>
  }
}