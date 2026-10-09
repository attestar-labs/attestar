# attestar-client JS

TypeScript bindings for the Attestar Soroban contract. The bindings are committed to this
repository (generated once from the contract spec with the Stellar CLI); nothing is generated at
install time.

## Exports

`src/index.ts` exports:

- `Client` — the contract client, extending `@stellar/stellar-sdk/contract`'s `ContractClient`.
  Methods: `initialize`, `set_verifier`, `submit_attestation`, `get_attestation`, `latest`,
  `is_solvent`, `verify_proof`.
- `networks` — the deployed network(s). Only `networks.testnet` is defined.
- `Errors` — the contract error codes: `NotInitialized`, `AlreadyInitialized`, `VerifierNotSet`,
  `InvalidProof`, `EpochExists`.
- The `Attestation`, `Proof`, `VerifyingKey`, and `DataKey` types, plus a re-export of
  `@stellar/stellar-sdk` and its `contract` and `rpc` namespaces.

## Use it

Pass the deployed contract id, the network passphrase, and an RPC URL to the `Client`
constructor. This mirrors the real usage in `apps/web/lib/contracts.ts`:

```ts
import { Buffer } from "buffer";
import { Client, networks } from "attestar-client";

// Live testnet deployment the app talks to (apps/web/lib/config.ts).
const ATTESTAR_ID = "CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH";

// Read-only: any account id works for simulation.
const attestar = new Client({
  contractId: ATTESTAR_ID,
  networkPassphrase: networks.testnet.networkPassphrase,
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey: "GDFKPIKJIY4JCYNMQ6IGX674O4HLPIPWD42LWHJSLOHAKR33IZ2VQTID",
});

const latest = (await attestar.latest()).result; // Option<Attestation>
```

For a write call, also pass a SEP-43 `signTransaction` function so the client can assemble and
sign the transaction with the issuer's wallet:

```ts
const attestar = new Client({
  contractId: ATTESTAR_ID,
  networkPassphrase: networks.testnet.networkPassphrase,
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey,
  signTransaction, // (xdr, opts) => Promise<{ signedTxXdr, signerAddress? }>
});

const tx = await attestar.submit_attestation({
  epoch: 1n,
  proof,
  liab_root,
  res_root,
  solvent: true,
  res_sig: Buffer.alloc(64),
});
const sent = await tx.signAndSend();
```

> These snippets are illustrative pseudocode. This package has no test runner, so they are not
> type-checked by CI; the exact, working usage is `apps/web/lib/contracts.ts`.

## Regenerating (optional)

From a machine with the Stellar CLI, regenerate the bindings against the deployed contract and
commit the result:

```bash
stellar contract bindings typescript \
  --contract-id CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  --output-dir .
```

The package is a private workspace dependency (`"attestar-client": "workspace:*"`) consumed by
`apps/web`, which links it directly, so no install-time generation is required.
