# usdc-client JS

TypeScript bindings for the USDC Stellar Asset Contract (SAC) interface. The bindings are
committed to this repository (generated once from the contract spec with the Stellar CLI);
nothing is generated at install time.

## Exports

`src/index.ts` exports:

- `Client` — the contract client, extending `@stellar/stellar-sdk/contract`'s `ContractClient`.
  Methods include `balance`, `transfer`, `transfer_from`, `approve`, `allowance`, `mint`, `burn`,
  `clawback`, `decimals`, `name`, `symbol`, and `trust`.
- `networks` — the deployed network(s). Only `networks.testnet` is defined.
- A re-export of `@stellar/stellar-sdk` and its `contract` and `rpc` namespaces.

## Use it

Pass the USDC SAC contract id, the network passphrase, and an RPC URL to the `Client`
constructor. This mirrors the real usage in `apps/web/lib/contracts.ts`:

```ts
import { Client, networks } from "usdc-client";

// Live testnet USDC SAC the app talks to (apps/web/lib/config.ts).
const USDC_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

const usdc = new Client({
  contractId: USDC_ID,
  networkPassphrase: networks.testnet.networkPassphrase,
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey: "GDFKPIKJIY4JCYNMQ6IGX674O4HLPIPWD42LWHJSLOHAKR33IZ2VQTID",
});

const bal = (await usdc.balance({ id: "GDFKPIKJIY4JCYNMQ6IGX674O4HLPIPWD42LWHJSLOHAKR33IZ2VQTID" })).result;
```

For a transfer signed by a wallet, also pass a SEP-43 `signTransaction` function:

```ts
const usdc = new Client({
  contractId: USDC_ID,
  networkPassphrase: networks.testnet.networkPassphrase,
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey,
  signTransaction,
});

const tx = await usdc.transfer({ from: publicKey, to: SINK_ADDRESS, amount: 10000000n });
const sent = await tx.signAndSend();
```

> These snippets are illustrative pseudocode. This package has no test runner, so they are not
> type-checked by CI; the exact, working usage is `apps/web/lib/contracts.ts`.

## Regenerating (optional)

From a machine with the Stellar CLI, regenerate the bindings against the deployed contract and
commit the result:

```bash
stellar contract bindings typescript \
  --contract-id CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  --output-dir .
```

The package is a private workspace dependency (`"usdc-client": "workspace:*"`) consumed by
`apps/web`, which links it directly, so no install-time generation is required.
