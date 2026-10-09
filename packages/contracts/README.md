# @attestar/contracts

Soroban (Rust) workspace for Attestar's on-chain verifier and attestation registry.

## Contract: `attestar`

Records a per-epoch solvency attestation for a token issuer.

| Function | Purpose |
| --- | --- |
| `initialize(admin, reserve_token, reserve_holder, attestor)` | one-time setup; `attestor` is the ed25519 pubkey allowed to sign off-chain fiat-reserve figures |
| `set_verifier(vk)` | admin stores the Groth16 verifying key (from `@attestar/circuits`) |
| `submit_attestation(epoch, proof, root, total_liabilities, fiat_reserves, fiat_sig)` | verifies the ZK proof, checks the fiat-reserve signature, reads on-chain reserves, records `solvent = reserves >= liabilities` |
| `get_attestation(epoch)` / `latest()` / `is_solvent(epoch)` | read the registry |

### What is implemented

- BN254 Groth16 verification (`src/groth16.rs`): MSM for `vk_x` plus a 4-term pairing-product
  check, using Stellar's P25/P26 host functions. Verified end to end with a real depth-2 proof
  both in unit tests (against the real host crypto) and live on testnet.
- Registry storage, on-chain reserve read (`TokenClient::balance`), signed fiat-reserve
  attestation (`ed25519_verify`), solvency comparison, events, getters.
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
