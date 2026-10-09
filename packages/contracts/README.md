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

### Storage lifetime (TTL)

Soroban archives any ledger entry whose TTL runs out, and the failure surfaces to a
caller as an opaque `contract invocation failed`. The contract therefore renews every
entry it reads or writes on a hot path, so an issuer that publishes — or a reader that
polls — at least once inside the window never sees an entry archive under it:

| Entry | Renewed by | Threshold | Extended to |
| --- | --- | --- | --- |
| contract instance + code (`Admin`, `ReserveToken`, `ReserveHolder`, `Attestor`, `Vk`, `LatestEpoch`) | `initialize`, `set_verifier`, `submit_attestation`, `get_attestation`, `latest` | `TTL_THRESHOLD_LEDGERS` = 518,400 ledgers (~30 days) | `TTL_EXTEND_TO_LEDGERS` = 1,036,800 ledgers (~60 days) |
| stored attestation record | `submit_attestation`, `get_attestation`, `is_solvent`, `latest` | 518,400 ledgers | 1,036,800 ledgers |

Stellar closes a ledger about every 5 seconds, so the threshold is roughly a month —
far longer than the daily publication cadence Attestar targets. Renewal only fires once
an entry has actually dropped below the threshold, so it costs at most one extension per
entry per month rather than on every call; the extension target doubles the threshold so
a single renewal covers a month of silence before the next access is even needed.

`extend_ttl` is only called for keys that exist, so reading an epoch that was never
published neither creates nor renews anything, and it still reads back as `None`.

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
