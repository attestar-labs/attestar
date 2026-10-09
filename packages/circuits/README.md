# @attestar/circuits

The zero-knowledge core of Attestar: a Circom circuit that proves
`on-chain reserves + private off-chain reserves >= total liabilities`, without revealing any
individual balance or either total.

## The shipped circuit

`circuits/psolvency_demo.circom` instantiates `PrivateSolvency(4, 3, 64, 96)` — up to 16
liability leaves, up to 8 off-chain reserve leaves, 64-bit balances, 96-bit comparison. Its
public signals, in order, are `liabRoot`, `resRoot`, `solvent`, `onchainReserves`. This is the
circuit the web app proves against and the deployed contract verifies.

`circuits/lib/private_solvency.circom` builds the two Merkle-sum trees and emits the solvency
comparison. `circuits/lib/solvency_tree.circom` provides the shared `Leaf`, `Node`, and
`SolvencyTree(DEPTH, BITS)` templates (Poseidon hashing, `Num2Bits(BITS)` range checks) used by
both the production circuit and the legacy single-tree circuits.

## Legacy circuits

`circuits/legacy/` holds the original single-tree circuits (`solvency.circom`,
`solvency_demo.circom`, `solvency_test.circom`). They are retained for reference only — nothing
builds or consumes them. See `circuits/legacy/README.md`.

## Build

```bash
pnpm install                 # pulls circomlib + snarkjs into this package
bash scripts/ptau.sh 16      # phase-1 powers of tau (>= ceil(log2(constraints)))
pnpm build                   # compile + Groth16 setup for psolvency_demo
node scripts/encode_vk.mjs psolvency_demo   # -> build/psolvency_demo/arg_vk.json
node scripts/encode_p.mjs                   # -> ../contracts/contracts/attestar/src/fixtures.rs
```

Artifacts land in `build/psolvency_demo/`:

- `psolvency_demo.zkey` — prover key.
- `psolvency_demo.vkey.json` — verifier key (consumed by the Soroban contract).
- `psolvency_demo_js/psolvency_demo.wasm` — witness generator.

## Design notes

- **Merkle-sum tree**: each leaf hash is `Poseidon(userId, balance)` and carries `sum = balance`;
  each internal node is `Poseidon(leftHash, leftSum, rightHash, rightSum)` with `sum = left + right`.
  The root therefore commits to both the membership set and the exact total.
- **Range checks are mandatory**: `Num2Bits(64)` on every balance blocks the negative-balance
  attack (faking lower liabilities with negative leaves).
- **Completeness** (no holder silently dropped) is enforced outside the circuit: each holder checks
  a Merkle inclusion path against the published root. The TS builder in `@attestar/sdk` produces
  identical roots and the inclusion paths, and must stay in lockstep with these templates.
- The trusted setup here is hackathon-grade (single phase-2 contribution). A production deployment
  needs a real multi-party ceremony.
