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
- Reproduce: `bash ../circuits/scripts/verify_testnet.sh` (real proof returns `true`, tampered
  input returns `false`).

### Public signal layout

The circuit exposes `[root, total]`. The contract reconstructs these as BN254 scalar-field
elements: `root` is the 32-byte Poseidon root; `total` is `total_liabilities` big-endian, left
padded to 32 bytes. This ordering must match the circuit output order.

## Build and test

```bash
# from this directory, with the WSL Rust + stellar toolchain on PATH
cargo test                 # runs the registry/getter tests (no proof needed)
stellar contract build     # produces the wasm for deployment
```

> Confirm the `soroban-sdk` version in `Cargo.toml` matches the installed protocol (P25/P26 expose
> the BN254 + Poseidon host functions) before the first build.
