# @attestar/circuits

The zero-knowledge core of Attestar: a Circom circuit that proves
`on-chain reserves + private off-chain reserves >= total liabilities`, without revealing any
individual balance or either total.
The zero-knowledge core of Attestar: Circom circuits that prove `on-chain reserves + private
off-chain reserves >= total liabilities`, without revealing any individual balance or either
total.
The zero-knowledge core of Attestar: Circom circuits that prove `on-chain reserves + private
off-chain reserves >= total liabilities`, without revealing any individual balance or either
total.

Two circuit families live here:

- **`PrivateSolvency(LIAB_DEPTH, RES_DEPTH, BITS, CMPBITS)`** — the production circuit. Holder
  liabilities and off-chain reserve sources are each committed as a Merkle-sum tree, every leaf
  is range checked, and the combined reserves are compared against the total liabilities inside
  the circuit. This is what the web app proves against and what the deployed contract verifies.
- **`SolvencyTree(DEPTH, BITS)`** — the original single-tree circuit (liabilities only, with the
  reserve figure supplied outside the circuit). Kept for reference and fast iteration; not part
  of the shipped path.

Two circuit families live here:

- **`PrivateSolvency(LIAB_DEPTH, RES_DEPTH, BITS, CMPBITS)`** — the production circuit. Holder
  liabilities and off-chain reserve sources are each committed as a Merkle-sum tree, every leaf
  is range checked, and the combined reserves are compared against the total liabilities inside
  the circuit. This is what the web app proves against and what the deployed contract verifies.
- **`SolvencyTree(DEPTH, BITS)`** — the original single-tree circuit (liabilities only, with the
  reserve figure supplied outside the circuit). Kept for reference and fast iteration; not part
  of the shipped path.

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
Every `.circom` file tracked under `circuits/`:

- `circuits/psolvency_demo.circom` — **production entry point**: instantiates
  `PrivateSolvency(4, 3, 64, 96)`, i.e. up to 16 liability leaves, up to 8 off-chain reserve
  leaves, 64-bit balances, and a 96-bit comparison.
- `circuits/lib/private_solvency.circom` — the `PrivateSolvency` template: builds the two
  Merkle-sum trees, sums on-chain + off-chain reserves, and emits the solvency comparison.
- `circuits/lib/solvency_tree.circom` — the shared `Leaf`, `Node`, and `SolvencyTree(DEPTH, BITS)`
  templates (Poseidon hashing, `Num2Bits(BITS)` range checks).
- `circuits/solvency.circom` — **legacy** single-tree circuit, `DEPTH = 10` (up to 1024 holders).
- `circuits/solvency_demo.circom` — **legacy** single-tree circuit, `DEPTH = 4` (up to 16
  holders).
- `circuits/solvency_test.circom` — **legacy** single-tree circuit, `DEPTH = 2` (4 holders) for
  fast local iteration and CI smoke tests.

## Public signals

`circuits/psolvency_demo.circom` (via `PrivateSolvency`) exposes four public signals, **in this
order**:

Every `.circom` file tracked under `circuits/`:

- `circuits/psolvency_demo.circom` — **production entry point**: instantiates
  `PrivateSolvency(4, 3, 64, 96)`, i.e. up to 16 liability leaves, up to 8 off-chain reserve
  leaves, 64-bit balances, and a 96-bit comparison.
- `circuits/lib/private_solvency.circom` — the `PrivateSolvency` template: builds the two
  Merkle-sum trees, sums on-chain + off-chain reserves, and emits the solvency comparison.
- `circuits/lib/solvency_tree.circom` — the shared `Leaf`, `Node`, and `SolvencyTree(DEPTH, BITS)`
  templates (Poseidon hashing, `Num2Bits(BITS)` range checks).
- `circuits/solvency.circom` — **legacy** single-tree circuit, `DEPTH = 10` (up to 1024 holders).
- `circuits/solvency_demo.circom` — **legacy** single-tree circuit, `DEPTH = 4` (up to 16
  holders).
- `circuits/solvency_test.circom` — **legacy** single-tree circuit, `DEPTH = 2` (4 holders) for
  fast local iteration and CI smoke tests.

## Public signals

`circuits/psolvency_demo.circom` (via `PrivateSolvency`) exposes four public signals, **in this
order**:

1. `liabRoot` — Poseidon Merkle-sum root of the private holder liabilities.
2. `resRoot` — Poseidon Merkle-sum root of the private off-chain reserve sources.
3. `solvent` — `1` iff `onchainReserves + offchainReserveTotal >= liabilitiesTotal`.
4. `onchainReserves` — the issuer's real on-chain token balance, substituted by the contract.

The contract rebuilds `[liabRoot, resRoot, solvent, onchainReserves]` from its own state and the
submitted roots, so a prover cannot overstate the on-chain figure. Everything else — every
balance, every user/source id, and both totals — stays private.

The legacy `SolvencyTree` circuits expose `root` then `total` instead.

## Build

```bash
pnpm install                 # pulls circomlib + snarkjs into this package
bash scripts/ptau.sh 16      # phase-1 powers of tau (>= ceil(log2(constraints)))
pnpm build                   # compile + Groth16 setup for psolvency_demo
pnpm install                            # pulls circomlib + snarkjs into this package
bash scripts/ptau.sh 16                 # phase-1 powers of tau (>= ceil(log2(constraints)))
bash scripts/build.sh psolvency_demo    # compile + Groth16 setup for the production circuit
node scripts/encode_vk.mjs psolvency_demo   # -> build/psolvency_demo/arg_vk.json
node scripts/encode_p.mjs                   # -> ../contracts/contracts/attestar/src/fixtures.rs
```

Artifacts land in `build/psolvency_demo/`:

- `psolvency_demo.zkey` — prover key.
- `psolvency_demo.vkey.json` — verifier key (consumed by the Soroban contract).
- `psolvency_demo_js/psolvency_demo.wasm` — witness generator.
- `scripts/build.sh` takes the circuit name as its first argument (`$1`, default `solvency`).
  The package's own `pnpm build` script hardcodes `solvency`, the legacy depth-10 circuit, so
  call the script directly for `psolvency_demo`. `pnpm build:test` builds the depth-2 legacy
  circuit for fast checks.
- `scripts/encode_vk.mjs <name>` writes `build/<name>/arg_vk.json`, the verifier key consumed by
  the Soroban contract (and copied into the web app as `apps/web/lib/vk.json`).
- `scripts/encode_p.mjs` generates the real proof fixtures the contract tests use and writes them
  to `packages/contracts/contracts/attestar/src/fixtures.rs` (from this package:
  `../contracts/contracts/attestar/src/fixtures.rs`).

Compiled artifacts land in `build/<name>/`:

- `<name>.zkey` — prover key.
- `<name>.vkey.json` — verifier key.
- `<name>_js/<name>.wasm` — witness generator.

## Design notes

- **Merkle-sum tree**: each leaf hash is `Poseidon(userId, balance)` and carries `sum = balance`;
  each internal node is `Poseidon(leftHash, leftSum, rightHash, rightSum)` with `sum = left + right`.
  The root therefore commits to both the membership set and the exact total.
- **Range checks are mandatory**: `Num2Bits(BITS)` on every balance blocks the negative-balance
  attack (faking lower liabilities with negative leaves).
- **Completeness** (no holder silently dropped) is enforced outside the circuit: each holder
  checks a Merkle inclusion path against the published root. The TS builder in `@attestar/sdk`
  produces identical roots and the inclusion paths, and must stay in lockstep with these
  templates.
- The trusted setup here is hackathon-grade (single phase-2 contribution). A production
  deployment needs a real multi-party ceremony.
