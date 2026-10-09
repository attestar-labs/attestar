// @ts-nocheck
import { Buffer } from "buffer";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// The publish path is the highest-risk client flow: it derives nextEpoch from
// the on-chain latest() and must submit the attestation before encrypting and
// saving the disclosure. Everything the component talks to is mocked.
const chain = vi.hoisted(() => {
  const state: any = {
    latest: null,
    balance: 5000n,
    submitArgs: [] as any[],
    signAndSend: null as any,
    saveDisclosure: null as any,
    encryptDisclosure: null as any,
    prove: null as any,
  };
  return state;
});

const wallet = vi.hoisted(() => ({
  address: "GISSUER7XQ2LZQV6WQ2F4SEXAMPLEXKJZ5VQ7XAMPLEQ2LZQV6WQ2F4S",
  connecting: false,
  role: "issuer",
  connect: vi.fn(),
  disconnect: vi.fn(),
  signTransaction: vi.fn(async () => ({ signedTxXdr: "signed" })),
  signMessage: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet }));

vi.mock("@/lib/contracts", () => {
  const client = () => ({
    latest: vi.fn(async () => ({ result: chain.latest })),
    submit_attestation: vi.fn(async (args: any) => {
      chain.submitArgs.push(args);
      return { signAndSend: chain.signAndSend };
    }),
  });
  return {
    attestarSigner: vi.fn(() => client()),
    tokenSigner: vi.fn(() => ({ transfer: () => ({ signAndSend: chain.signAndSend }) })),
    attestarReader: vi.fn(() => ({ latest: vi.fn(async () => ({ result: chain.latest })) })),
    tokenReader: vi.fn(() => ({ balance: vi.fn(async () => ({ result: chain.balance })) })),
  };
});

vi.mock("@/lib/prover-browser", () => ({
  proveSolvencyPrivate: (...args: any[]) => chain.prove(...args),
}));

vi.mock("@/lib/disclosure", () => ({
  encryptDisclosure: (...args: any[]) => chain.encryptDisclosure(...args),
  saveDisclosure: (...args: any[]) => chain.saveDisclosure(...args),
  loadDisclosure: vi.fn(() => null),
  DEFAULT_VIEW_KEY: "regulator-view-key-2026",
  DISCLOSURE_KEY: "attestar:disclosure",
}));

vi.mock("@phosphor-icons/react", () => ({
  Plus: () => <span />,
  Trash: () => <span />,
  LockKey: () => <span />,
  ArrowSquareOut: () => <span />,
  ShieldCheck: () => <span />,
  Lightning: () => <span />,
  Bank: () => <span />,
  CircleNotch: () => <span />,
  CheckCircle: () => <span />,
  Circle: () => <span />,
}));

import { IssuerView } from "@/components/issuer-view";

const privateProof = () => ({
  proof: { a: Buffer.alloc(64, 1), b: Buffer.alloc(128, 2), c: Buffer.alloc(64, 3) },
  liabRoot: Buffer.alloc(32, 4),
  resRoot: Buffer.alloc(32, 5),
  liabRootHex: "04".repeat(32),
  resRootHex: "05".repeat(32),
  solvent: true,
});

async function generateProof() {
  fireEvent.click(screen.getByRole("button", { name: /Generate proof in browser/ }));
  const publish = await screen.findByRole("button", { name: /Sign & publish attestation/ });
  await waitFor(() => expect(publish).toBeEnabled());
  return publish;
}

describe("IssuerView publish path", () => {
  beforeEach(() => {
    chain.latest = null;
    chain.balance = 5000n;
    chain.submitArgs = [];
    chain.prove = vi.fn(async () => privateProof());
    chain.signAndSend = vi.fn(async () => ({ sendTransactionResponse: { hash: "abc" } }));
    chain.saveDisclosure = vi.fn();
    chain.encryptDisclosure = vi.fn(async () => ({ salt: "s", iv: "i", ct: "c", epoch: "1" }));
  });

  it("submits epoch 8 when the chain already has epoch 7", async () => {
    chain.latest = { epoch: 7, solvent: true };
    render(<IssuerView />);

    const publish = await generateProof();
    fireEvent.click(publish);

    await waitFor(() => expect(chain.submitArgs).toHaveLength(1));
    expect(chain.submitArgs[0].epoch).toBe(8n);
    expect(chain.submitArgs[0].solvent).toBe(true);
  });

  it("starts at epoch 1 when no attestation exists", async () => {
    chain.latest = null;
    render(<IssuerView />);

    const publish = await generateProof();
    fireEvent.click(publish);

    await waitFor(() => expect(chain.submitArgs).toHaveLength(1));
    expect(chain.submitArgs[0].epoch).toBe(1n);
  });

  it("always submits a 64-byte res_sig buffer", async () => {
    chain.latest = { epoch: 2, solvent: true };
    render(<IssuerView />);

    const publish = await generateProof();
    fireEvent.click(publish);

    await waitFor(() => expect(chain.submitArgs).toHaveLength(1));
    expect(Buffer.isBuffer(chain.submitArgs[0].res_sig)).toBe(true);
    expect(chain.submitArgs[0].res_sig).toHaveLength(64);
  });

  it("saves the disclosure only after the transaction resolves", async () => {
    chain.latest = { epoch: 3, solvent: true };
    render(<IssuerView />);

    const publish = await generateProof();
    fireEvent.click(publish);

    await waitFor(() => expect(chain.saveDisclosure).toHaveBeenCalledTimes(1));
    const sendOrder = chain.signAndSend.mock.invocationCallOrder[0];
    const saveOrder = chain.saveDisclosure.mock.invocationCallOrder[0];
    expect(saveOrder).toBeGreaterThan(sendOrder);
  });

  it("surfaces a rejected signAndSend and does not save the disclosure", async () => {
    chain.latest = { epoch: 4, solvent: true };
    chain.signAndSend = vi.fn(async () => {
      throw new Error("wallet rejected the transaction");
    });
    render(<IssuerView />);

    const publish = await generateProof();
    fireEvent.click(publish);

    expect(await screen.findByText("wallet rejected the transaction")).toBeInTheDocument();
    expect(chain.saveDisclosure).not.toHaveBeenCalled();
  });
});
