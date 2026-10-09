import { describe, expect, it } from "vitest";
import { Client as AttestarClient, networks as attestarNetworks } from "attestar-client";
import { Client as TokenClient, networks as tokenNetworks } from "usdc-client";

// Live testnet deployments from apps/web/lib/config.ts.
const ATTESTAR_ID = "CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH";
const TOKEN_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const READER = "GDFKPIKJIY4JCYNMQ6IGX674O4HLPIPWD42LWHJSLOHAKR33IZ2VQTID";
const RPC = "https://soroban-testnet.stellar.org";

describe("generated clients do not bake in a contract id", () => {
  it("exposes only the network passphrase in `networks`", () => {
    expect("contractId" in attestarNetworks.testnet).toBe(false);
    expect("contractId" in tokenNetworks.testnet).toBe(false);
  });

  it("constructs the Attestar client with the caller-supplied id", () => {
    const client = new AttestarClient({
      contractId: ATTESTAR_ID,
      networkPassphrase: attestarNetworks.testnet.networkPassphrase,
      rpcUrl: RPC,
      publicKey: READER,
    });
    expect(client.options.contractId).toBe(ATTESTAR_ID);
  });

  it("constructs the token client with the caller-supplied id", () => {
    const client = new TokenClient({
      contractId: TOKEN_ID,
      networkPassphrase: tokenNetworks.testnet.networkPassphrase,
      rpcUrl: RPC,
      publicKey: READER,
    });
    expect(client.options.contractId).toBe(TOKEN_ID);
  });
});
