"use client";

import { useRef, useState } from "react";
import { Buildings, User, Scales, ArrowRight } from "@phosphor-icons/react";
import { Eyebrow } from "@/components/panel";
import type { Role } from "@/lib/wallet";

const ROLES: {
  role: Role;
  title: string;
  icon: React.ReactNode;
  line: string;
  action: string;
}[] = [
  {
    role: "issuer",
    title: "Issuer",
    icon: <Buildings size={22} weight="light" />,
    line: "Generate a zero-knowledge proof that your reserves cover every holder balance, in your browser, then sign it on-chain with your wallet. No balance ever leaves your device.",
    action: "Prove solvency",
  },
  {
    role: "holder",
    title: "Holder",
    icon: <User size={22} weight="light" />,
    line: "Don't trust, verify. Connect your wallet and confirm your own balance was counted in the proven total, without seeing anyone else's and without anyone seeing yours.",
    action: "Verify my inclusion",
  },
  {
    role: "regulator",
    title: "Regulator",
    icon: <Scales size={22} weight="light" />,
    line: "Everyone sees only SOLVENT and the total. With a view key, you alone reconstruct the full account-level composition. Selective disclosure, on demand.",
    action: "Audit the breakdown",
  },
];

export function RolePicker({ onPick }: { onPick: (role: Role) => void }) {
  const [focusIndex, setFocusIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = ROLES.length - 1;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    setFocusIndex(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="pb-24">
      <section className="grid items-center gap-10 py-16 md:py-24">
        <div className="flex max-w-3xl flex-col gap-6 rise">
          <Eyebrow>Zero-knowledge proof of reserves · Stellar</Eyebrow>
          <h1 className="text-balance font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
            Solvency you can <span className="italic text-brass">verify</span>, not just trust.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-bone-dim">
            Today an issuer&apos;s reserves arrive as a monthly PDF you take on faith. Attestar
            replaces that faith with math: a stablecoin or RWA issuer proves, every epoch and
            on-chain, that reserves cover every holder balance, without revealing a single account.
            The proof is a Groth16 SNARK verified inside a Soroban smart contract.
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate">
            Pick a role to step into the system
          </p>
        </div>
      </section>

      <section
        role="radiogroup"
        aria-label="Pick a role to step into the system"
        className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3"
      >
        {ROLES.map((r, i) => (
          <button
            key={r.role}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={false}
            tabIndex={i === focusIndex ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, i)}
            onClick={() => onPick(r.role)}
            className="group flex flex-col gap-4 bg-ink p-7 text-left transition hover:bg-ink-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass/50"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/30 text-brass">
              {r.icon}
            </span>
            <h3 className="font-display text-2xl tracking-tight">{r.title}</h3>
            <p className="flex-1 text-sm leading-relaxed text-bone-dim">{r.line}</p>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brass">
              {r.action}
              <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </section>

      <p className="mt-8 text-center font-mono text-[11px] text-slate">
        Groth16 · BN254 · Poseidon · Soroban · client-side proving
      </p>
    </div>
  );
}
