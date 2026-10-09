<div align="center">

# Attestar

**Continuous, private proof of solvency for stablecoin and RWA issuers on Stellar.**

An issuer proves on-chain that its reserves cover every holder balance, without revealing a single account, a single custodian, or even the totals. The verdict is a zero-knowledge SNARK verified inside a Soroban smart contract.

[![Stellar testnet](https://img.shields.io/badge/Stellar-testnet-000?logo=stellar)](https://stellar.expert/explorer/testnet/contract/CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH)
[![Soroban](https://img.shields.io/badge/Soroban-BN254%20host%20fns-5fd4c4)](https://developers.stellar.org/docs/build/apps/zk)
[![Groth16](https://img.shields.io/badge/Groth16-BN254-c9a45c)](https://docs.circom.io/)
[![Circom](https://img.shields.io/badge/Circom-2.2-blue)](https://docs.circom.io/)
[![Reserve asset](https://img.shields.io/badge/Reserves-real%20Circle%20USDC-2775CA)](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA)

</div>

---

Attestar is proof-of-reserves that a regulator would accept and a competitor cannot read. An issuer keeps its customer ledger and its reserve composition private, generates a Groth16 proof **in the browser** that `on-chain USDC + private off-chain reserves >= liabilities`, and submits it with a **Freighter**-signed transaction. The Soroban contract verifies the proof against Stellar's native **BN254** host functions and substitutes the issuer's **real on-chain USDC balance** as the only public reserve input, so the number cannot be faked. Holders independently verify their own inclusion; a regulator with a view key reconstructs the full breakdown. This is the always-on, cryptographic complement to the monthly accounting attestation that the US **GENIUS Act** and EU **MiCA** now require.

## The problem

Proof-of-reserves today is a PDF. An accounting firm signs a point-in-time attestation once a month, you take it on faith, and nothing is verifiable in between. That model has already failed in public: USDC depegged to $0.87 in March 2023 when 8% of its reserves were trapped at Silicon Valley Bank, Tether has still never completed a Big-Four audit, and in 2026 a regulated exchange kept asserting solvency while its hot wallet drained to nothing. Meanwhile the GENIUS Act and MiCA have turned voluntary attestation into a legal mandate with monthly reserve disclosure and officer certification.

The obvious fix, put reserves and liabilities on-chain, breaks on privacy. A stablecoin or tokenized-fund issuer cannot publish its customer ledger or reveal which banks hold how much of its reserves; that is competitively and legally radioactive. So issuers are stuck between an unverifiable monthly PDF and a transparency they cannot accept.

Zero-knowledge dissolves the tradeoff. Attestar proves the *property* you care about, reserves cover liabilities, every epoch and on-chain, while the underlying figures stay private. Verifiable transparency for the public, full disclosure for the regulator, secrecy from everyone else.

## What it proves

The circuit takes two private vectors and one public number and proves a single inequality in zero knowledge:

```mermaid
flowchart LR
    subgraph PRIV["Private to the issuer's browser"]
        L["Holder liabilities<br/>(Merkle-sum tree)"]
        R["Off-chain reserves<br/>(Merkle-sum tree)"]
    end
    subgraph PUB["Public inputs"]
        O["Real on-chain USDC<br/>(substituted by the contract)"]
    end
    L --> CIRC
    R --> CIRC
    O --> CIRC
    CIRC["PrivateSolvency circuit<br/>onchain + reserves ≥ liabilities"] --> OUT["Public signals:<br/>liabRoot · resRoot · solvent"]

    classDef priv fill:#1c1708,stroke:#c9a45c,color:#ece6d8
    classDef pub fill:#0a1a2f,stroke:#5fd4c4,color:#ece6d8
    classDef circ fill:#13110a,stroke:#e2bd74,color:#ece6d8
    class L,R priv
    class O pub
    class CIRC,OUT circ
```

- Every balance is **range-checked** (`Num2Bits(64)`), which blocks the classic proof-of-reserves fraud of hiding liabilities behind negative leaves.
- Both totals stay private. Only two Poseidon **root commitments**, the boolean **verdict**, and the issuer's real **on-chain USDC** are public.
- Because the contract supplies the on-chain figure itself, a prover cannot overstate reserves: the four public signals must match the proof exactly or verification fails.

## Three actors, one balance sheet

```mermaid
flowchart TD
    ISS["🏦 Issuer · Freighter<br/>holds the private books"]
    HOLD["👤 Holder · Freighter<br/>a customer"]
    REG["⚖ Regulator · view key"]

    PROVE["Browser prover<br/>Groth16 · client-side"]
    C["Attestar contract<br/>Soroban · BN254 verify"]
    USDC[("Real USDC reserves<br/>on-chain")]
    PUBLIC["🌐 Public"]

    ISS -->|"private ledger + reserves<br/>never leave the device"| PROVE
    PROVE -->|"~200-byte proof + 2 roots + verdict"| C
    USDC -->|"balance read trustlessly"| C
    ISS -->|"Freighter-signed submit"| C
    C -->|"SOLVENT + commitments only"| PUBLIC
    HOLD -->|"Merkle inclusion (local)"| C
    REG -->|"AES-GCM view key"| DISC[("Full account-level<br/>disclosure")]

    classDef a fill:#1c1708,stroke:#c9a45c,color:#ece6d8
    classDef c fill:#0a1a2f,stroke:#5fd4c4,color:#ece6d8
    class ISS,HOLD,REG a
    class PROVE,C,USDC,PUBLIC,DISC c
```

- **Issuer** edits a private liability ledger and private reserve sources, proves solvency in the browser, and publishes with their wallet. Draining real USDC and re-publishing flips the on-chain verdict to `INSOLVENT`. The issuer cannot publish a `SOLVENT` lie, because the verdict is computed inside the proof against the real on-chain balance.
- **Holder** connects a wallet and verifies a Merkle inclusion path proving their own balance is counted in the proven liabilities, seeing only their own number.
- **Regulator** connects the authorized wallet, signs an audit-access message, and decrypts the issuer's disclosure package to reconstruct every holder balance and every reserve source. Selective disclosure, on demand.

## System architecture

```mermaid
flowchart TB
    F["🦊 You · Freighter (testnet)"]

    subgraph WEB["apps/web · Next.js 15"]
        direction LR
        RP["Role picker"]
        IV["Issuer view"]
        HV["Holder view"]
        RV["Regulator view"]
    end

    subgraph LIB["client libraries"]
        direction LR
        PB["prover-browser<br/>snarkjs Groth16"]
        WK["Stellar Wallets Kit"]
        DS["disclosure<br/>AES-GCM"]
    end

    subgraph CHAIN["Stellar testnet"]
        direction LR
        ATT["Attestar contract<br/>BN254 verify + registry"]
        USDC["USDC SAC<br/>(real Circle USDC)"]
    end

    F -->|connect + sign| WK
    RP --> IV & HV & RV
    IV -->|build proof| PB
    IV -->|submit_attestation| ATT
    IV -->|drain transfer| USDC
    ATT -->|reads balance| USDC
    HV -->|inclusion + read latest| ATT
    RV -->|read latest| ATT
    IV -->|encrypt breakdown| DS
    RV -->|decrypt with view key| DS

    classDef web fill:#1c1708,stroke:#c9a45c,color:#ece6d8
    classDef lib fill:#13110a,stroke:#e2bd74,color:#ece6d8
    classDef chain fill:#0a1a2f,stroke:#5fd4c4,color:#ece6d8
    class RP,IV,HV,RV web
    class PB,WK,DS lib
    class ATT,USDC chain
```

## End-to-end flow

```mermaid
sequenceDiagram
    autonumber
    actor I as Issuer (Freighter)
    participant W as Web (browser)
    participant P as snarkjs (in browser)
    participant A as Attestar (Soroban)
    participant U as USDC SAC
    actor H as Holder
    actor R as Regulator

    I->>W: Activate verifier (one-time, signed)
    W->>A: set_verifier(vk)
    I->>W: Generate proof
    W->>P: build 2 Merkle-sum trees + witness
    P-->>W: Groth16 proof + roots + verdict
    I->>W: Sign & publish
    W->>A: submit_attestation(proof, liab_root, res_root, solvent)
    A->>U: balance(reserve_holder)  // real USDC, substituted as public input
    A->>A: BN254 verify + record verdict
    A-->>W: SOLVENT
    Note over I,U: Drain USDC, re-publish -> INSOLVENT. The proof cannot lie.
    H->>A: read latest root
    H->>W: verify my inclusion (local Merkle path)
    R->>W: sign audit message + view key
    W-->>R: decrypt full liabilities + reserve composition
```

## The honest boundary

Zero-knowledge proves two things trustlessly: the liabilities committed in the tree, and the on-chain reserves the contract reads itself. It cannot prove that an **off-chain bank balance exists**; that figure enters the proof as a value the issuer commits to, attestable by a custodian ed25519 signature (the contract supports this path). Attestar makes everything around the monthly audit continuous and verifiable, and binds the off-chain figure to a signature, but it complements the accounting attestation rather than replacing the auditor. We state this plainly because understanding the boundary is the difference between a real privacy product and an overclaim.

## What is real vs. illustrative

| Piece | Status |
|---|---|
| The ZK circuit, proving, and on-chain BN254 verification | **Real.** 30,284-constraint Groth16 circuit, verified on Stellar testnet. |
| Reserves (on-chain portion) | **Real Circle USDC** on testnet, read trustlessly by the contract. Drain is a real Freighter-signed USDC transfer. |
| Wallet signing | **Real Freighter** for all three roles. |
| Holder liability ledger and off-chain reserve sources | **Illustrative example data**, edited in-browser. In production these are the issuer's real private records. They are *meant* to be private and off-chain; that is the point of the ZK. |
| Off-chain fiat existence | Enters as a committed/attested figure (the honest boundary above). |

## Repository layout

```
attestar/
├─ packages/
│  ├─ circuits/          Circom: PrivateSolvency circuit (two Merkle-sum trees + range checks
│  │                     + in-circuit solvency), trusted-setup + encoding scripts
│  ├─ sdk/               TypeScript: MerkleSumTree, Poseidon, witness builder, Groth16 encoding
│  │                     (kept byte-identical to the circuit)
│  ├─ contracts/         Soroban (Rust): Attestar verifier + attestation registry, 10 tests
│  ├─ attestar-client/   Generated TS bindings for the Attestar contract
│  └─ usdc-client/       Generated TS bindings for the USDC token (SAC) interface
├─ apps/
│  └─ web/               Next.js 15 app: role picker, issuer/holder/regulator views,
│                        client-side proving, Freighter signing, selective disclosure
└─ docs/                 DESIGN.md (original design notes) + demo script
```

## Tech stack

| Layer | What |
|---|---|
| **ZK circuit** | Circom 2.2, Groth16 over BN254, Poseidon hashing, `snarkjs` trusted setup |
| **Proving** | `snarkjs` running client-side (WASM) in the browser; balances never leave the device |
| **On-chain verifier** | Soroban (`soroban-sdk` 27), Stellar **BN254 host functions** (Protocol 25 "X-Ray") for MSM + pairing check |
| **Reserve asset** | Real Circle USDC on Stellar testnet via its Stellar Asset Contract |
| **Frontend** | Next.js 15, React 19, Tailwind v4 |
| **Wallet** | Stellar Wallets Kit (Freighter), SEP-43 signing |
| **Selective disclosure** | WebCrypto AES-GCM under a regulator view key |

## Deployed on Stellar testnet

| Contract | Address |
|---|---|
| **Attestar** (this project) | [`CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH`](https://stellar.expert/explorer/testnet/contract/CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH) |
| USDC (reserve asset, SAC) | [`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |
| Circle USDC issuer (testnet) | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |

The Attestar contract surface: `initialize`, `set_verifier`, `submit_attestation`, `get_attestation`, `latest`, `is_solvent`, `verify_proof`.

## Getting started

**Prerequisites:** Node 20+, pnpm 10 (`corepack enable && corepack prepare pnpm@10.10.0 --activate`), and for rebuilding the ZK + contract: Rust, the `stellar` CLI, and `circom` 2.2 (on Windows these run in WSL). A **Freighter** wallet on **testnet** with a USDC trustline and a little testnet USDC (from [faucet.circle.com](https://faucet.circle.com)).

Run the web app against the live testnet deployment:

```bash
pnpm install
pnpm --filter @attestar/sdk build
pnpm --filter attestar-client --filter usdc-client build
pnpm web:dev        # http://localhost:3100
```

`apps/web/.env.local` is preconfigured with the deployed contract IDs above. Connect Freighter, then: **Activate verifier** (one-time), **Generate proof**, **Sign & publish** (SOLVENT), **Drain USDC**, re-publish (INSOLVENT). Switch roles from the header to verify inclusion as a holder and unlock disclosure as a regulator.

Rebuild the ZK core and redeploy from scratch (WSL):

```bash
# 1. circuit: compile + Groth16 trusted setup (depth 4 liabilities / depth 3 reserves)
cd packages/circuits
bash scripts/ptau.sh 16
bash scripts/build.sh psolvency_demo
node scripts/encode_vk.mjs psolvency_demo        # -> arg_vk.json (for the contract / web)
node scripts/encode_p.mjs                         # -> Rust test fixtures (real proofs)

# 2. contract: build + test against the real BN254 host crypto
cd ../contracts && stellar contract build && cargo test -p attestar

# 3. deploy + initialize with the real USDC SAC as reserve_token, admin = your Freighter address,
#    then point apps/web/.env.local at the new contract id and copy the proving assets into
#    apps/web/public/circuit (psolvency_demo.wasm + .zkey) and apps/web/lib/vk.json.
```

### Circuit artifacts

Only the two proving assets the web app loads at runtime are committed:

- `apps/web/public/circuit/psolvency_demo.wasm`
- `apps/web/public/circuit/psolvency_demo.zkey`

Every other build product under `packages/circuits/build/**` (and any other `*.zkey` / `*.wasm`)
is gitignored. Regenerate them with `bash scripts/build.sh psolvency_demo` from `packages/circuits`
(powers of tau first via `bash scripts/ptau.sh 16`), or copy them from a previous build. A CI guard
(`.github/scripts/check-artifacts.sh`) fails any change that tracks a circuit artifact outside the
two files above.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the original design notes and the research that validated the idea.

## License

MIT

---

<div align="center">
<sub>Attestar · solvency you can verify, not just trust. Built for Stellar Hacks: Real-World ZK.</sub>
</div>
