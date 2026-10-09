# @attestar/contracts

Soroban (Rust) workspace for Attestar's on-chain verifier and attestation registry.

## Contract: `attestar`

Records a per-epoch solvency attestation for a token issuer.

| Function | Signature | Purpose |
| --- | --- | --- |
| `initialize` | `initialize(admin, reserve_token, reserve_holder, attestor)` | one-time setup. `admin` authorizes `set_verifier` and `submit_attestation`; `reserve_token` is the reserve SAC and `reserve_holder` the address whose balance the contract reads; `attestor` is the ed25519 public key (32 bytes) allowed to sign the off-chain reserve commitment (32 zero bytes disables the check). |
| `set_verifier` | `set_verifier(vk)` | admin-only; stores the Groth16 `VerifyingKey` produced from `@attestar/circuits`. |
| `submit_attestation` | `submit_attestation(epoch, proof, liab_root, res_root, solvent, res_sig)` | admin-only. Reads the issuer's real on-chain reserve balance, substitutes it as the fourth public input, and verifies `proof` over `[liab_root, res_root, solvent, onchain_reserves]`. Records an `Attestation` for `epoch`; a repeated epoch returns `EpochExists`. |
| `get_attestation` | `get_attestation(epoch) -> Option<Attestation>` | the stored attestation for one epoch. |
| `latest` | `latest() -> Option<Attestation>` | the most recently recorded attestation. |
| `is_solvent` | `is_solvent(epoch) -> bool` | the stored `solvent` flag, or `false` for an unknown epoch. |
| `verify_proof` | `verify_proof(vk, proof, public_inputs) -> bool` | stateless, reusable on-chain Groth16 verifier. |

`submit_attestation` does not recompute solvency: `solvent` is a public input computed inside the
circuit and verified by the proof against the other three signals, and the contract only supplies
`onchain_reserves` from `TokenClient::balance`, so a prover cannot overstate either its reserves or
its verdict. `res_sig` is checked only when a non-zero `attestor` is configured; `verify_reserve_sig`
reconstructs the signed message as `epoch` big-endian (8 bytes) followed by `res_root` (32 bytes)
and verifies it with `ed25519_verify`.

### What is implemented

- BN254 Groth16 verification (`src/groth16.rs`): MSM for `vk_x` plus a 4-term pairing-product
  check, using Stellar's P25/P26 host functions. Verified end to end with a real depth-2 proof
  both in unit tests (against the real host crypto) and live on testnet.
- Registry storage, on-chain reserve read (`TokenClient::balance`), custodian ed25519
  attestation over `(epoch || res_root)`, getters and the `AttestationPosted` event.
- `verify_proof(vk, proof, public_inputs)`: a stateless, reusable on-chain Groth16 verifier.

### Live on testnet

- Contract: `CDEGNQIHKDYXE7PNV6SHJ6OENSVDPLUEL5KS7TDHTJQIAQBBJMT4U5QS`
- Real proof verifies (on-chain tx): https://stellar.expert/explorer/testnet/tx/94573ab6e3c3cf8768c6553fc8b819ead12fe13170e2168b86d56426c9ab4c58
- Reproduce (production circuit): `node ../circuits/scripts/encode_p.mjs` regenerates
  `src/fixtures.rs`, then `cargo test -p attestar` checks the real proofs against the host crypto.
  (The legacy depth-2 `verify_testnet.sh` was removed together with the single-tree circuits.)

### Public signal layout

The deployed circuit is `PrivateSolvency(4, 3, 64, 96)`. `submit_attestation` builds the public
inputs in `public_inputs` (`src/lib.rs`) in exactly this order:

| # | Signal | Encoding |
| --- | --- | --- |
| 0 | `liab_root` | the liabilities Merkle-sum root, a 32-byte big-endian Poseidon digest |
| 1 | `res_root` | the off-chain reserve Merkle-sum root, a 32-byte big-endian Poseidon digest |
| 2 | `solvent` | the boolean verdict as a 32-byte field element: all zeros, with the last byte `1` when true (`bool_field`) |
| 3 | `onchain_reserves` | the reserve balance cast from `i128` to `u128`, a 16-byte big-endian value left-padded to 32 bytes (`u128_field`) |

`onchain_reserves` is not supplied by the prover: the contract reads
`TokenClient::balance(reserve_holder)` itself and substitutes it, so the prover cannot inflate the
reserve figure. The proof binds all four signals together, so any value that differs from what the
circuit committed makes verification fail.

The verifying key's `ic` length must equal the number of public signals plus one —
`groth16::verify` returns `false` when `vk.ic.len() != n + 1`. This circuit therefore needs
`4 + 1 = 5` points, as in the `IC: [[u8; 64]; 5]` fixture.

Worked example, from the solvent fixture in `src/fixtures.rs` (matching `S_PUB`):

| # | Signal | Fixture constant | Value (hex) |
| --- | --- | --- | --- |
| 0 | `liab_root` | `S_LIAB_ROOT` | `0062d547dafb19649eaf44663a8e5c162a4fd11027af60443cafacaf6f5b56ee` |
| 1 | `res_root` | `S_RES_ROOT` | `299da752eb363df9f9b711c23f63820c22643bfcb2dd064f8cf6072332104295` |
| 2 | `solvent` | `S_SOLVENT` | `00…0001` (`true`) |
| 3 | `onchain_reserves` | `S_ONCHAIN` | `00…001388` (`5000`) |

## Build and test

```bash
# from this directory, with the WSL Rust + stellar toolchain on PATH
cargo test                 # runs the registry/getter tests (no proof needed)
stellar contract build     # produces the wasm for deployment
```

> Confirm the `soroban-sdk` version in `Cargo.toml` matches the installed protocol (P25/P26 expose
> the BN254 + Poseidon host functions) before the first build.
