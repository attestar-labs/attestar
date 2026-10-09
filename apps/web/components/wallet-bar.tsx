"use client";

import { Wallet, SignOut } from "@phosphor-icons/react";
import { useWallet, type Role } from "@/lib/wallet";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SealMark } from "@/components/seal-mark";

const ROLE_LABEL: Record<Role, string> = {
  issuer: "Issuer",
  holder: "Holder",
  regulator: "Regulator",
};

export function WalletBar({
  role,
  onHome,
}: {
  role: Role | null;
  onHome: () => void;
}) {
  const { address, connecting, connect, disconnect } = useWallet();

  return (
    <nav className="flex items-center justify-between py-6">
      <button onClick={onHome} className="group flex items-center gap-2.5">
        <SealMark size={22} className="text-brass" />
        <span className="font-display text-lg tracking-tight transition group-hover:text-brass">
          Attestar
        </span>
      </button>
      <div className="flex items-center gap-4">
        {role && (
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-brass sm:inline">
            {ROLE_LABEL[role]} console
          </span>
        )}
        {address ? (
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-raised px-3 py-1.5 font-mono text-xs text-bone-dim"
              title={address}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-proven" />
              {shortHash(address, 5)}
            </span>
            <button
              onClick={disconnect}
              className="text-slate transition hover:text-failed"
              aria-label="Disconnect wallet"
            >
              <SignOut size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => connect(role ?? "issuer")}
            disabled={connecting}
            aria-label={connecting ? "Connecting wallet" : "Connect Freighter wallet"}
            className={cn(
              "inline-flex items-center gap-2 rounded-full bg-bone px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60",
            )}
          >
            <Wallet size={15} />
            {connecting ? "Connecting…" : "Connect Freighter"}
          </button>
        )}
      </div>
    </nav>
  );
}
