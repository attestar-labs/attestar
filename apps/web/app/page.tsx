"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { WalletBar } from "@/components/wallet-bar";
import { RolePicker } from "@/components/role-picker";
import { explorerContract } from "@/lib/format";
import { ATTESTAR_ID } from "@/lib/config";
import type { Role } from "@/lib/wallet";

// The issuer and holder consoles pull in the proving stack (`@attestar/sdk`, and `snarkjs`
// via its dynamic import) transitively. Load them on demand so the role picker — the first
// screen — never downloads or parses any of it before it is interactive.
const IssuerView = dynamic(() => import("@/components/issuer-view").then((m) => m.IssuerView), {
  ssr: false,
});
const HolderView = dynamic(() => import("@/components/holder-view").then((m) => m.HolderView), {
  ssr: false,
});
const RegulatorView = dynamic(
  () => import("@/components/regulator-view").then((m) => m.RegulatorView),
  { ssr: false },
);

export default function Home() {
  const [role, setRole] = useState<Role | null>(null);

  return (
    <main className="mx-auto max-w-5xl px-6">
      <WalletBar role={role} onHome={() => setRole(null)} />

      {role === null && <RolePicker onPick={setRole} />}
      {role === "issuer" && <IssuerView />}
      {role === "holder" && <HolderView />}
      {role === "regulator" && <RegulatorView />}

      <footer className="border-t border-line py-8 text-sm text-bone-dim">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate">
            Attestar · Real-World ZK on Stellar
          </span>
          <a
            href={explorerContract(ATTESTAR_ID)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-brass hover:text-bone"
          >
            Contract on-chain ↗
          </a>
        </div>
        <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-slate">
          Zero-knowledge proves the liabilities sum and the on-chain reserves trustlessly. Off-chain
          fiat reserves enter as a signed attestation; Attestar makes everything around the monthly
          audit continuous and verifiable. It complements the auditor, it does not replace them.
        </p>
      </footer>
    </main>
  );
}
