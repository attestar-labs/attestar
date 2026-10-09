// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const attestarOptions: Array<Record<string, unknown>> = [];
const tokenOptions: Array<Record<string, unknown>> = [];

vi.mock("attestar-client", () => ({
  Client: class AttestarClient {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      attestarOptions.push(options);
    }
  },
}));

vi.mock("usdc-client", () => ({
  Client: class TokenClient {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      tokenOptions.push(options);
    }
  },
}));

import { ATTESTAR_ID, TOKEN_ID, RPC_URL, NETWORK_PASSPHRASE, RESERVE_HOLDER } from "../lib/config";
import { attestarSigner, tokenSigner, attestarReader, tokenReader, contractIds } from "../lib/contracts";

const signer = async () => ({ signedTxXdr: "xdr" });

beforeEach(() => {
  attestarOptions.length = 0;
  tokenOptions.length = 0;
});

describe("contracts factory wiring", () => {
  it("forwards the app configuration to the Attestar signer", () => {
    attestarSigner("GCALLER", signer);
    expect(attestarOptions).toHaveLength(1);
    const options = attestarOptions[0];
    expect(options.contractId).toBe(ATTESTAR_ID);
    expect(options.networkPassphrase).toBe(NETWORK_PASSPHRASE);
    expect(options.rpcUrl).toBe(RPC_URL);
    expect(options.publicKey).toBe("GCALLER");
    expect(options.signTransaction).toBe(signer);
  });

  it("forwards the token contract id to the token signer", () => {
    tokenSigner("GCALLER", signer);
    expect(tokenOptions).toHaveLength(1);
    expect(tokenOptions[0].contractId).toBe(TOKEN_ID);
    expect(tokenOptions[0].publicKey).toBe("GCALLER");
    expect(tokenOptions[0].signTransaction).toBe(signer);
  });

  it("gives the Attestar and token factories different default contract ids", () => {
    expect(ATTESTAR_ID).not.toBe(TOKEN_ID);
    expect(contractIds.attestar).toBe(ATTESTAR_ID);
    expect(contractIds.token).toBe(TOKEN_ID);
  });

  it("defaults the readers to RESERVE_HOLDER", () => {
    attestarReader();
    tokenReader();
    expect(attestarOptions[0].publicKey).toBe(RESERVE_HOLDER);
    expect(tokenOptions[0].publicKey).toBe(RESERVE_HOLDER);
    expect(attestarOptions[0].signTransaction).toBeUndefined();
    expect(tokenOptions[0].signTransaction).toBeUndefined();
    expect(contractIds.reserveHolder).toBe(RESERVE_HOLDER);
  });

  it("accepts a reader publicKey override", () => {
    attestarReader("GREADER");
    tokenReader("GREADER");
    expect(attestarOptions[0].publicKey).toBe("GREADER");
    expect(tokenOptions[0].publicKey).toBe("GREADER");
  });
});
