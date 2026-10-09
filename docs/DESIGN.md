# Attestar — Master Design Doc

> Single source of truth for the project. If context is lost or compacted, read this file
> top to bottom to reload the complete picture: what we are building, why, the architecture,
> the demo, and the build plan.

Name: **Attestar** (attestation + the Stellar star motif). Tagline: "Continuous, provable solvency."

Last updated: 2026-06-20
Status: ZK pipeline working end to end. SDK-circuit lockstep proven; Groth16 proof verified
on-chain on Stellar testnet (real tx) and tampered input rejected. Remaining: end-to-end
submit_attestation flow with a reserve token, the web app, and the demo video.

### Repo state

The repository is a pnpm workspace; the members are exactly those listed in
`pnpm-workspace.yaml`:

- `packages/circuits`: Circom circuits. The production circuit is the two-tree `PrivateSolvency`
  template (`circuits/psolvency_demo.circom`); `circuits/solvency*.circom` are the legacy
  single-tree circuits, plus build + ptau + encoding scripts.
- `packages/sdk`: TS `MerkleSumTree` (build / proofFor / verifyProof), `buildPrivateInput`, and
  Groth16 encoding, using circomlibjs Poseidon. Must stay byte-identical to the circuit hashing
  scheme.
- `packages/contracts`: Soroban `AttestarContract` (`initialize`, `set_verifier`,
  `submit_attestation`, `get_attestation`, `latest`, `is_solvent`, `verify_proof`): registry,
  on-chain reserve read, ed25519 reserve attestation, Groth16 verification, solvency comparison,
  events.
- `packages/attestar-client`: generated TypeScript bindings for the Attestar contract.
- `packages/usdc-client`: generated TypeScript bindings for the USDC token (Stellar Asset
  Contract) interface.
- `apps/web`: Next.js 15 app (Tailwind v4): role picker plus issuer, holder, and regulator views,
  browser-side Groth16 proving, Freighter signing, and AES-GCM selective disclosure.
- Toolchain: a Unix-like environment (WSL on Windows) with rustup, circom, and stellar-cli;
  snarkjs is a local devDependency of `packages/circuits` (no global install). Machine-specific
  Windows/WSL setup is confined to Appendix A.
- GitHub remote: https://github.com/attestar-labs/attestar.git (branch main).

### Progress log
- 2026-06-20 (Day 1-2 done): toolchain installed in WSL (rustc 1.96, circom 2.2.3,
  stellar-cli 27.0.0 from prebuilt binary; cargo-built stellar-cli failed on libdbus, so we use
  the GitHub release binary at `~/.cargo/bin/stellar`). soroban-sdk pinned to `27.0.0-rc.1`.
  Contract builds to wasm (5.8KB, 6 exports) and `cargo test` passes (2 tests). Circuit compiles
  (depth-2 = 4539 constraints). **SDK-circuit lockstep PROVEN**: identical Merkle-sum root,
  Groth16 proof verifies, inclusion proof verifies (`scripts/lockstep.mjs`).
- ptau: hermez S3 mirror returns 403; use the `storage.googleapis.com/zkevm/ptau` mirror, with
  local generation fallback in `scripts/ptau.sh`.
- Constraint cost note: Poseidon(4) internal nodes are ~1100 constraints each. depth-2 = 4539.
  Extrapolated depth-10 ~ 1.4M constraints (needs ptau power 21, large). For the demo, prefer a
  modest depth (6 to 8) unless we optimize the node hash. Revisit before the depth-10 main build.

- 2026-06-20 (Day 4 DONE, the critical path): `groth16::verify` wired with the real BN254 host
  functions (MSM for vk_x + 4-term pairing-product check, A negated on-chain via the SDK Neg).
  Encoding confirmed: G1 = be(X)||be(Y); G2 = be(X.c1)||be(X.c0)||be(Y.c1)||be(Y.c0)
  (imaginary-first); snarkjs G2 is [c0,c1] per coord, so we swap. Public signal order [root,total].
  - Unit tests pass against the real host crypto (valid -> true, tampered -> false).
  - Deployed to testnet: contract `CDEGNQIHKDYXE7PNV6SHJ6OENSVDPLUEL5KS7TDHTJQIAQBBJMT4U5QS`,
    deployer identity `deployer` (funded via friendbot).
  - Live on-chain: real proof returns true (tx
    https://stellar.expert/explorer/testnet/tx/94573ab6e3c3cf8768c6553fc8b819ead12fe13170e2168b86d56426c9ab4c58),
    tampered input returns false. Reproduce: `bash packages/circuits/scripts/verify_testnet.sh`.
  - Added stateless `verify_proof(vk, proof, public_inputs)` contract fn (reusable verifier).
- WSL shell gotcha: moved to Appendix A (Windows / WSL notes).

- 2026-06-20 (full attestation flow DONE): end-to-end `submit_attestation` tested with a real
  Stellar Asset Contract reserve token (`register_stellar_asset_contract_v2`) and a real ed25519
  signed fiat attestation (ed25519-dalek in dev-deps). 10 tests pass: solvent, insolvent, fiat
  oracle tips solvency, fiat-sig skipped when fiat=0, mismatched-total -> InvalidProof, duplicate
  epoch -> EpochExists, plus the groth16 + init tests. Design change: fiat signature only required
  when `fiat_reserves > 0` (pure on-chain reserves are trustless).

- 2026-06-20 (FULL ON-CHAIN DEMO WORKING): `packages/contracts/scripts/demo_testnet.sh` runs the
  whole flow on testnet. Epoch 1 reserves 12000 >= liabilities 9500 -> AttestationPosted{solvent:
  true}; issuer drains 6000; epoch 2 reserves 6000 < 9500 -> AttestationPosted{solvent: false}.
  This is the FTX/Zondacrypto beat live on-chain (ZK verify + reserve read + solvency flip).
  Demo deployment (re-run script to refresh): token
  `CB5IWYQ6VABQ7TSGQKMEC7F3BR3HOS5TO3O44J4CK75QAJXMO3PY5MMO`, attestar
  `CB2FQBKA4UGJ3VSNRYDD6IAMOKJ7IVBZH5SOT3BAZCPTIPRJYBEUCCI6`. The whole backend product is proven
  on-chain; the web app is now a UI over a working system.

- 2026-06-20 (WEB APP DONE): full Next.js 15 demo app live on testnet, browser-tested end to end.
  Design: Tailwind v4 @theme (ink/bone/brass/proven/failed), Fraunces + Geist + Geist Mono. The
  signature element is the live "Solvency Seal" (brass ring, flips green SOLVENT / red INSOLVENT).
  Architecture: server actions do issuer-side proving (snarkjs over the depth-4 solvency_demo
  circuit) + encode + submit via the generated attestar-client/usdc-client bindings, signed
  with the issuer key (basicNodeSigner). Reviewed against the Web Interface Guidelines (focus-visible,
  aria-live, theme-color, numeric inputs). Verified the full beat in-browser: publish -> SOLVENT,
  drain -> reserves drop, publish -> INSOLVENT (real testnet txs), plus holder inclusion check.
  - Stable web demo deployment (from `setup_web_demo.sh`, depth-4 vkey set):
    attestar `CBM5K5RIAH4QIDMULKU6K7RFQP5ZEEOZM5O46QHMNJNAT6A4LQP55QOC`,
    token `CALXJ4SGBXJQRLHZSDDKFXDT2ZGSMSCW5KDPJ5R4BS4BULG7LHP6WMUU`. Config in apps/web/.env.local
    (gitignored: holds the issuer secret). Dev server on port 3100 (3000 is the Excalidraw canvas).
  - serverExternalPackages in next.config keeps snarkjs/circomlibjs/stellar-sdk out of the bundle.

### What remains
- Record the 2-3 min demo video (script at docs/DEMO_SCRIPT.md).
- Optional polish: auditor selective-disclosure view, more holders in the demo, copy pass.
- The submission is otherwise complete: open-source repo, working ZK-on-Stellar, clear README.

---

## 1. One-line pitch

Continuous, on-chain, zero-knowledge proof-of-reserves-and-liabilities for stablecoin and
RWA issuers on Stellar. An issuer proves every epoch that `reserves >= sum of all holder
liabilities`, without revealing any individual balance, and every holder can verify their own
balance was counted. A regulator with a view key can audit the totals.

## 2. The hackathon (the target)

- Event: **Stellar Hacks: Real-World ZK** on DoraHacks.
  https://dorahacks.io/hackathon/stellar-hacks-zk/detail
- Prize pool: $10,000 in XLM. 1st $5,000 / 2nd $2,000 / 3rd $1,250 / 4th $1,000 / 5th $750.
- Single open-innovation track. Judge = Stellar Development Foundation (SDF). No published
  weighted rubric; judging is qualitative.
- Window: submissions June 15 to **June 29, 2026, 12:00 PM PST**. (Today is 2026-06-20, so
  roughly 9 days remain.)
- Hard requirements: open-source repo + clear README, 2 to 3 minute demo video, and **ZK must
  be load-bearing** (it powers a real part of how the project works, not namechecked on a slide).
- A separate **Stellar Hacks: ZK Gaming** hackathon exists, so pure-game ZK ideas belong there,
  not here. This event rewards real-world money utility.

## 3. Why this idea wins (the strategic case)

What the research established about how to win this specific event:

1. **Judges reward real-world money utility + a working polished demo + a crisp narrative**,
   over raw cryptographic novelty. (Pattern from past Stellar winners: StellarFinance payroll,
   Cards402 agent wallet, Blend tooling.)
2. **SDF's stated north star is compliance-forward privacy, not anonymity.** Recurring themes
   in their own materials: selective disclosure, view keys, stablecoins, cross-border, RWA,
   institutional settlement. They literally say "privacy must be compliance-ready from the start."
   Source: https://stellar.org/blog/ecosystem/strategy-for-privacy-on-blockchain
3. **Proof-of-reserves is on SDF's own idea wishlist** ("proof-of-reserves for an issuer") yet
   has **no incumbent on Stellar**. Wanted by the judges, built by nobody. This is the ideal slot.
4. **ZK is structurally load-bearing here.** The whole product is a proof of a hidden sum
   (liabilities) plus a comparison against reserves. You cannot fake "ZK does real work"; it is
   the entire mechanism.
5. **Highest floor / lowest delivery risk** of the candidate ideas. Self-contained circuit, no
   multi-party live UX needed, and it demos with a single unforgettable beat (issuer tries to
   lie about solvency, the proof fails, the contract rejects it).

## 4. Green-flag validation (done 2026-06-20)

### 4a. Nobody has built this on Stellar (novelty confirmed)
- Prior-art agent scanned the full lumenloop ecosystem DB (749 projects) + SCF awards: **no
  dedicated proof-of-reserves / proof-of-solvency project on Soroban.** Crowded lanes (privacy
  pools, confidential transfers, ZK identity, ZK voting, ZK games) all have incumbents; this one
  has zero. lumenloop DB: https://github.com/lumenloop/stellar-ecosystem-db
- Independent web search confirms: Stellar materials describe reserve attestation as a *possible*
  use case and the building blocks exist, but no shipped "proof of reserves" project by name on
  Soroban. https://stellar.org/blog/developers/financial-privacy
- It appears on SDF's own Inspiration & Ideas list ("proof-of-reserves for an issuer"), unclaimed.

### 4b. The problem is real, current, regulator-driven (problem confirmed)
- **US GENIUS Act:** mandates 100% reserves and **monthly attestation by a licensed CPA** plus
  monthly public composition disclosure; reserves limited to USD cash and T-bills <= 93 days.
  Treasury targeting final rules ~July 2026 (now).
- **EU MiCA:** in full enforcement; issuer authorization hard deadline July 1, 2026.
- Today's proof-of-reserves is off-chain, monthly, manual CPA attestation: slow, trust-based,
  gameable. The gap is continuous, cryptographic, on-chain assurance.
- Live failure mode: **Zondacrypto collapsed April 2026 while still claiming solvency** (hot
  wallet drained 99.7%). Post-FTX context.
- Live real-money hook on Stellar: **MoneyGram's MGUSD launched on Stellar June 2, 2026.**
  USDC is already native.
- Sources: GENIUS/MiCA: https://www.kucoin.com/blog/en-stablecoin-regulation-updates-2026-genius-act-mica-enforcement-global-compliance-trends ,
  https://bitwage.com/en-us/blog/stablecoin-regulation-guide-2026-genius-clarity-mica

### 4c. The honest scope boundary (keeps the idea valid, not overclaimed)
ZK cleanly proves the two pieces that exist in cryptographic form:
- **(a) total liabilities** = the hidden sum of all holder balances, and
- **(b) on-chain reserves** held in a Stellar/Soroban address (read trustlessly).

ZK cannot conjure the existence of **off-chain fiat reserves** (a real bank balance). That always
needs a signed attestation fed in as an oracle input. So the correct framing is:

> Attestar = continuous on-chain cryptographic solvency that complements the monthly CPA
> attestation. It proves liabilities and on-chain reserves trustlessly every epoch, and binds
> the off-chain reserve figure to a signed attestation so the full picture is verifiable on-chain
> between audits.

State this boundary plainly in the README and demo. It signals to judges that we understand the
real problem rather than overclaiming a magic solution.

## 5. Technical stack decision

- **Proving system: Circom + Groth16 (BN254).** Chosen because it is the fastest reliable path:
  smallest proofs (constant 3 group elements), cheapest on-chain verification, most mature
  off-chain tooling (circom + snarkjs), and the most worked end-to-end examples on Stellar.
- **Starting point for the on-chain plumbing:** James Bachini's circom-on-stellar repo/tutorial,
  which already solves the snarkjs-proof-to-Soroban byte-encoding (the recurring integration tax).
  https://jamesbachini.com/circom-on-stellar/
- **Why not the alternatives:**
  - Noir / UltraHonk: verification is on the borderline of Soroban CPU instruction limits
    (needs `--limits unlimited` for even simple circuits). Highest risk for a 9-day build. Avoid.
  - RISC Zero: great for verifiable general-purpose Rust compute, heavier to stand up. Only worth
    it if the hook is arbitrary computation; ours is a structured sum proof, so Circom is better.
- **Hashing: Poseidon** (native Soroban host function since Protocol 25 X-Ray; Circom-friendly).
- **Both enabling protocol upgrades are LIVE ON MAINNET:** Protocol 25 "X-Ray" (BN254 + Poseidon,
  mainnet Jan 22 2026) and Protocol 26 "Yardstick" (9 more BN254 host functions, mainnet May 6
  2026). We build on testnet, target the same protocol.
- **Frontend: Next.js** (issuer dashboard, holder inclusion check, auditor view). Plays to our
  existing strengths.
- **Off-chain prover:** node + snarkjs, run server-side for the issuer (large tree, heavy proof).
  Holder inclusion check is a cheap Merkle path verified client-side.

Key references:
- ZK on Stellar docs: https://developers.stellar.org/docs/build/apps/zk
- Privacy on Stellar docs: https://developers.stellar.org/docs/build/apps/privacy
- Groth16 verifier example (note: official one is BLS12-381, older; we use BN254 path): https://github.com/stellar/soroban-examples/tree/main/groth16_verifier
- Nethermind Private Payments PoC (source of reusable Circom primitives: commitments, range,
  conservation): https://github.com/NethermindEth/stellar-private-payments
- Soroban SDK Poseidon docs: https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_poseidon/index.html
- Soroban SDK BN254 docs: https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_bn254/index.html

## 6. Architecture

### 6a. Data structure: Merkle-sum tree
- Each **leaf** = a holder: `leaf_hash = Poseidon(holder_id_commitment, balance)`, `leaf_sum = balance`.
- Each **internal node** carries both a hash and a running sum:
  `node_sum = left.sum + right.sum`,
  `node_hash = Poseidon(left.hash, left.sum, right.hash, right.sum)`.
- The **root** commits to both the structure and the **total liabilities** (root.sum).
- Tree depth sets max holders. Start depth 10 to 16 (about 1k to 65k holders) for the demo.

### 6b. The solvency circuit (the core ZK)
Public inputs (visible on-chain):
- `merkle_root` (root hash, which binds root.sum / total liabilities)
- `total_liabilities` (= root.sum, surfaced as a public signal)
- `reserves` (or a reserves commitment; see 6c)
- `epoch`

The circuit proves, in zero knowledge over the private leaves:
1. **Sum consistency:** every internal node's sum equals the sum of its children, all the way to
   the root. The root sum equals `total_liabilities`.
2. **Non-negativity / range proof on every balance.** This is mandatory. The classic
   proof-of-reserves attack is injecting negative balances to understate liabilities. Each
   `balance` must be proven in `[0, 2^k)`.
3. **Solvency comparison:** `reserves >= total_liabilities`.

Output: a single Groth16 proof verified on-chain in one transaction.

### 6c. Reserves side (two parts, honest split)
- **On-chain reserves:** the Soroban contract reads the issuer's reserve address token balance
  directly (USDC / MGUSD / mock token). Fully trustless.
- **Off-chain fiat reserves:** a signed attestation `(reserve_value, epoch)` from the issuer or
  their auditor, fed in as an oracle input. The contract verifies the signature. This is the
  boundary from section 4c. For the demo we can show both: a real on-chain reserve balance, plus
  a signed off-chain attestation to demonstrate the full pattern.

### 6d. Holder inclusion proof
- Each holder receives a Merkle path from their leaf to the published root.
- They verify client-side (and optionally on-chain) that `Poseidon(their_id, their_balance)` is
  in the tree and contributes to the proven total. This prevents the issuer from excluding
  liabilities to fake a lower total (the other half of honest proof-of-reserves).

### 6e. Soroban contract surface (draft)
- `init(admin, verifier_vk, reserve_token_address, attestor_pubkey)`
- `submit_proof(epoch, proof, public_signals)`:
  verify the Groth16 proof, check `reserves >= total_liabilities`, store `{root, total_liabilities,
  reserves, solvent: bool, timestamp}` for the epoch.
- `get_attestation(epoch) -> Attestation` (root, totals, solvent flag, timestamp).
- `verify_inclusion(epoch, leaf, path) -> bool` (optional on-chain; usually client-side).
- View-key / selective disclosure: auditor decrypts encrypted totals or receives the full leaf
  set off-chain, keyed to the on-chain commitment.

Note: state lives in contract storage, not events, so the 7-day RPC event-retention gotcha does
not affect us.

## 7. The demo (the script that makes judges nod)

1. Set up a mock issuer ("MGUSD-lite" or a demo USDC issuer) with N holders.
2. Build the Merkle-sum tree, generate the ZK proof that `reserves >= liabilities`, submit it
   on-chain. Contract marks the epoch **SOLVENT** (green).
3. A holder opens the UI and verifies their inclusion proof: "your balance is counted."
4. **The money beat:** the issuer secretly drains reserves but still tries to publish a solvent
   claim. The proof fails / the contract rejects it. The UI flips to **INSOLVENT / INVALID** (red).
   This is the FTX / Zondacrypto moment made impossible. This single beat is the pitch.
5. The auditor uses a view key to reveal the full breakdown (selective disclosure), showing the
   compliance-ready story SDF wants.

## 8. Nine-day build plan (from 2026-06-20)

- **Day 1:** Stand up Circom + Groth16 on Stellar testnet from Bachini's repo. Verify a trivial
  proof on-chain end to end. Measure CPU cost. Lock toolchain (WSL on Windows).
- **Day 2:** Implement the Merkle-sum tree circuit (Poseidon), sum-consistency + per-balance range
  proofs. Test locally with snarkjs.
- **Day 3:** Add the `reserves >= liabilities` comparison and finalize the public-signal layout.
  Get the full proof verifying locally.
- **Day 4:** Soroban verifier contract: adapt the Groth16 verifier, implement `submit_proof`,
  storage, `get_attestation`. Deploy to testnet, verify a real proof on-chain.
- **Day 5:** Reserves integration: read on-chain token balance + signed off-chain attestation
  oracle. Holder inclusion verification (client-side).
- **Day 6:** Frontend (Next.js): issuer dashboard, submit proof, solvency status, holder inclusion
  check.
- **Day 7:** The "cheat fails" demo flow + auditor view-key selective-disclosure path.
- **Day 8:** Polish UI, write README with the honest scoping note, handle edge cases, seed
  realistic MGUSD-style data.
- **Day 9:** Record the 2 to 3 minute demo video, finalize README, submit. Keep buffer.

## 9. Risks and mitigations

- **CPU instruction limits:** Groth16 verification fits comfortably post-P25. Low risk. Measure
  on Day 1 anyway.
- **Tree depth vs proving time:** larger trees mean heavier proving. Run proving server-side for
  the issuer; keep demo depth modest (10 to 16). Holder inclusion is a cheap Merkle path.
- **Negative-balance attack:** mitigated by mandatory per-leaf range proofs (section 6b.2). Do not
  skip these.
- **Byte-encoding plumbing (snarkjs proof -> Soroban):** the recurring integration tax. Lean on
  Bachini's reference conversion code instead of reinventing it.
- **Toolchain pinning on Windows:** use WSL. Circom path is the least finicky of the three stacks.
- **Every verifier here is unaudited:** fine for a hackathon. State it clearly in the README.

## 10. Alternatives considered (and why we did not pick them)

- **Confidential token on Soroban (ERC-7984 model), "Veil":** highest ceiling on the
  "ecosystem future" narrative (Stellar co-founded the Confidential Token Association, no Soroban
  impl exists), but it is a confidential-transfer scheme (commitments + range + balance
  conservation) that is much harder to fully ship in 9 days. Risk of a half-working "polished
  mystery," which SDF explicitly says they do not want. Kept as a stretch / future direction.
- **ZK RWA / private-credit fund attestation, "Attest":** most unique and least crowded, best fit
  for RISC Zero (prove a Rust policy over a hidden portfolio), but the demo is more abstract and
  RISC Zero is heavier to stand up. Strong dark horse, lower demo clarity.

## 11. Source index (for re-grounding)

- Hackathon: https://dorahacks.io/hackathon/stellar-hacks-zk/detail
- SDF privacy strategy: https://stellar.org/blog/ecosystem/strategy-for-privacy-on-blockchain
- SDF 5 real-world ZK use cases: https://stellar.org/blog/developers/5-real-world-zero-knowledge-use-cases
- ZK on Stellar docs: https://developers.stellar.org/docs/build/apps/zk
- Privacy on Stellar docs: https://developers.stellar.org/docs/build/apps/privacy
- X-Ray (P25): https://stellar.org/blog/developers/announcing-stellar-x-ray-protocol-25
- Yardstick (P26): https://stellar.org/blog/foundation-news/stellar-yardstick-protocol-26-upgrade-guide
- Circom on Stellar tutorial: https://jamesbachini.com/circom-on-stellar/
- Nethermind Private Payments PoC: https://github.com/NethermindEth/stellar-private-payments
- Groth16 verifier example: https://github.com/stellar/soroban-examples/tree/main/groth16_verifier
- Ecosystem DB (novelty scan): https://github.com/lumenloop/stellar-ecosystem-db
- GENIUS/MiCA 2026: https://www.kucoin.com/blog/en-stablecoin-regulation-updates-2026-genius-act-mica-enforcement-global-compliance-trends
- Proof-of-reserves background (Merkle sum, ZK): https://financefeeds.com/proof-of-reserves-crypto-exchanges/

## Appendix A: Windows / WSL notes

These notes are specific to the original Windows + WSL development machine and are kept only to
reproduce that setup. Nothing else in this document depends on them.

- WSL Ubuntu install of rustup + circom (from git) + stellar-cli running in the background;
  snarkjs is a local devDependency of `packages/circuits` (no global/sudo needed). Node/pnpm run
  on the Windows side.
- Toolchain install script at `~/install_attestar.sh` in WSL, log at
  `~/attestar-toolchain-install.log`.
- The repository was checked out at `/mnt/d/Programming/hacks/attestar` (the Windows path
  `D:\Programming\hacks\attestar`); `packages/contracts/scripts/setup_web_demo.sh` and
  `packages/contracts/scripts/demo_testnet.sh` still set `ABS` to that mount point.
- WSL shell gotcha: bare `VAR=...` assignments and `$(...)` capture get mangled through
  `wsl bash -lc '...'` from the tool layer. Put logic in a script FILE on `/mnt/d` and run that.
  Also WSL `/tmp` is wiped on distro restart between calls; write intermediate files under
  `/mnt/d`.
