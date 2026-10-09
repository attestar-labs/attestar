"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule, FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { networkForPassphrase } from "./network";

export type Role = "issuer" | "holder" | "regulator";

const PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export interface SignedXdr {
  signedTxXdr: string;
  signerAddress?: string;
}

interface WalletState {
  address: string | null;
  connecting: boolean;
  role: Role | null;
  connect: (role: Role) => Promise<string | null>;
  disconnect: () => Promise<void>;
  signTransaction: (
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string },
  ) => Promise<SignedXdr>;
  signMessage: (message: string) => Promise<string>;
}

const Ctx = createContext<WalletState | null>(null);

let initialized = false;
function ensureInit() {
  if (initialized) return;
  StellarWalletsKit.init({
    modules: [new FreighterModule()],
    selectedWalletId: FREIGHTER_ID,
    network: networkForPassphrase(PASSPHRASE),
  });
  initialized = true;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    ensureInit();
  }, []);

  const connect = useCallback(async (nextRole: Role) => {
    ensureInit();
    setConnecting(true);
    try {
      const { address: addr } = await StellarWalletsKit.authModal();
      setAddress(addr);
      setRole(nextRole);
      return addr;
    } catch {
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {}
    setAddress(null);
    setRole(null);
  }, []);

  const signTransaction = useCallback(
    async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) => {
      const res = await StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? PASSPHRASE,
        address: opts?.address ?? address ?? undefined,
      });
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
    },
    [address],
  );

  const signMessage = useCallback(
    async (message: string) => {
      const res = await StellarWalletsKit.signMessage(message, {
        networkPassphrase: PASSPHRASE,
        address: address ?? undefined,
      });
      return res.signedMessage;
    },
    [address],
  );

  const value = useMemo<WalletState>(
    () => ({ address, connecting, role, connect, disconnect, signTransaction, signMessage }),
    [address, connecting, role, connect, disconnect, signTransaction, signMessage],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
