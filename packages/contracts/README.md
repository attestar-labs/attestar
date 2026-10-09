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

### Rejected at the contract

The circuit binds every public signal, but the contract also checks the invariants the
circuit relies on before it spends a pairing on the proof, so a verifying key from a
mismatched or relaxed circuit build cannot record a contradictory verdict:

| Code | Error | Rejected when |
| --- | --- | --- |
| 1 | `NotInitialized` | the admin key is unset |
| 2 | `AlreadyInitialized` | `initialize` is called twice |
| 3 | `VerifierNotSet` | `submit_attestation` runs before `set_verifier` |
| 4 | `InvalidProof` | the Groth16 proof does not match the public signals |
| 5 | `EpochExists` | that epoch already has a record |
| 6 | `NegativeReserves` | the issuer's on-chain reserve balance is negative |
| 7 | `ZeroRoot` | `liab_root` or `res_root` is the zero field element |
| 8 | `IdenticalRoots` | `liab_root` and `res_root` are the same commitment |

Codes 6–8 are checked against the signals the same call supplies, before verification;
the solvency verdict itself is left to the circuit, because whether reserves cover
liabilities cannot be re-derived on-chain without the witness.

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
