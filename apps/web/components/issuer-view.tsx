"use client";

import { Buffer } from "buffer";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash,
  LockKey,
  ArrowSquareOut,
  ShieldCheck,
  Lightning,
  Bank,
  CircleNotch,
  CheckCircle,
  Circle,
} from "@phosphor-icons/react";
import { useWallet } from "@/lib/wallet";
import { attestarSigner, tokenSigner, attestarReader, tokenReader, verifierIsSet } from "@/lib/contracts";
import { verifyingKey } from "@/lib/vkey-browser";
import { proveSolvencyPrivate, type PrivateProof, type ProveStage } from "@/lib/prover-browser";
import {
  loadLedger,
  saveLedger,
  loadSources,
  saveSources,
  sumBase,
  toHolders,
  type LedgerEntry,
} from "@/lib/ledger";
import { encryptDisclosure, saveDisclosure, DEFAULT_VIEW_KEY } from "@/lib/disclosure";
import { Panel, Eyebrow, Stat } from "@/components/panel";
import { SolvencySeal } from "@/components/solvency-seal";
import { baseToUsdc, usdcToBase, shortHash, explorerTx } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ATTESTAR_ID, RESERVE_HOLDER, SINK_ADDRESS as SINK } from "@/lib/config";

type Status = "solvent" | "insolvent" | "none";

const STAGE_LABEL: Record<ProveStage, string> = {
  tree: "Building Merkle-sum trees…",
  witness: "Computing witness…",
  proving: "Generating Groth16 proof in your browser…",
  done: "Proof ready",
};

const VERIFIER_FLAG = `attestar:verifier:${ATTESTAR_ID}`;

export function IssuerView() {
  const { address, connect, signTransaction } = useWallet();

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [sources, setSources] = useState<LedgerEntry[]>([]);
  const [status, setStatus] = useState<Status>("none");
  const [epoch, setEpoch] = useState<string | null>(null);
  const [reservesBase, setReservesBase] = useState<bigint>(0n);
  const [proof, setProof] = useState<PrivateProof | null>(null);
  const [stage, setStage] = useState<ProveStage | null>(null);
  const [verifierSet, setVerifierSet] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(VERIFIER_FLAG) === "1",
  );
  const [transferAmount, setTransferAmount] = useState("8");
  const [busy, setBusy] = useState<string | null>(null);
  const [tx, setTx] = useState<{ label: string; hash?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLedger(loadLedger());
    setSources(loadSources());
  }, []);

  // The contract's stored verifying key is the source of truth for whether the
  // one-time setup panel is still needed; localStorage is only a cache.
  const refreshVerifier = useCallback(async () => {
    try {
      const onchain = await verifierIsSet();
      setVerifierSet(onchain);
      if (onchain) window.localStorage.setItem(VERIFIER_FLAG, "1");
      else window.localStorage.removeItem(VERIFIER_FLAG);
    } catch {
      // An unreadable chain must not hide the one-time setup; show it so the
      // issuer can recover by activating the verifier.
      setVerifierSet(false);
    }
  }, []);

  useEffect(() => {
    refreshVerifier();
  }, [refreshVerifier]);

  const liabilitiesBase = useMemo(() => sumBase(ledger), [ledger]);
  const offchainBase = useMemo(() => sumBase(sources), [sources]);
  const totalReservesBase = reservesBase + offchainBase;
  const wouldBeSolvent = totalReservesBase >= liabilitiesBase;

  const refresh = useCallback(async () => {
    try {
      const [latest, bal] = await Promise.all([
        attestarReader().latest().then((t) => t.result),
        tokenReader().balance({ id: RESERVE_HOLDER }).then((t) => t.result),
      ]);
      setReservesBase(BigInt(bal));
      if (latest) {
        setStatus(latest.solvent ? "solvent" : "insolvent");
        setEpoch(latest.epoch.toString());
      } else {
        setStatus("none");
        setEpoch(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function edit(
    setter: typeof setLedger,
    saver: (e: LedgerEntry[]) => void,
    i: number,
    key: keyof LedgerEntry,
    value: string,
  ) {
    setter((es) => {
      const next = es.map((e, j) => (j === i ? { ...e, [key]: value } : e));
      saver(next);
      return next;
    });
  }
  function add(setter: typeof setLedger, saver: (e: LedgerEntry[]) => void, label: string) {
    setter((es) => {
      if (es.length >= 16) return es;
      const next = [...es, { userId: String(es.length + 1), balance: "0", label: `${label} ${es.length + 1}` }];
      saver(next);
      return next;
    });
  }
  function remove(setter: typeof setLedger, saver: (e: LedgerEntry[]) => void, i: number) {
    setter((es) => {
      const next = es.filter((_, j) => j !== i);
      saver(next);
      return next;
    });
  }

  function guard(): string | null {
    if (!address) {
      connect("issuer");
      return null;
    }
    return address;
  }

  async function activateVerifier() {
    const addr = guard();
    if (!addr) return;
    setBusy("Activating verifier");
    setError(null);
    setTx(null);
    try {
      const at = await attestarSigner(addr, signTransaction).set_verifier({ vk: verifyingKey });
      const sent = await at.signAndSend();
      await refreshVerifier();
      setTx({ label: "Verifier activated on-chain", hash: sent.sendTransactionResponse?.hash });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateProof() {
    setBusy("Proving");
    setError(null);
    setProof(null);
    setTx(null);
    try {
      const p = await proveSolvencyPrivate(toHolders(ledger), toHolders(sources), reservesBase, setStage);
      setProof(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStage(null);
      setBusy(null);
    }
  }

  async function publish() {
    const addr = guard();
    if (!addr) return;
    if (!proof) {
      setError("Generate the proof first.");
      return;
    }
    setBusy("Publishing");
    setError(null);
    setTx(null);
    try {
      const client = attestarSigner(addr, signTransaction);
      const latest = (await client.latest()).result;
      const nextEpoch = latest ? BigInt(latest.epoch) + 1n : 1n;
      const at = await client.submit_attestation({
        epoch: nextEpoch,
        proof: proof.proof,
        liab_root: proof.liabRoot,
        res_root: proof.resRoot,
        solvent: proof.solvent,
        res_sig: Buffer.alloc(64),
      });
      const sent = await at.signAndSend();
      const disclosure = await encryptDisclosure(
        {
          ledger,
          sources,
          onchain: reservesBase.toString(),
          solvent: proof.solvent,
        },
        DEFAULT_VIEW_KEY,
        nextEpoch.toString(),
      );
      saveDisclosure(disclosure);
      setTx({
        label: `Epoch ${nextEpoch} attested · ${proof.solvent ? "SOLVENT" : "INSOLVENT"}`,
        hash: sent.sendTransactionResponse?.hash,
      });
      setProof(null);
      await refresh();
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        /VerifierNotSet|#3/.test(msg)
          ? "Verifier not set. Activate the verifier first (the step above)."
          : msg,
      );
    } finally {
      setBusy(null);
    }
  }

  async function drain() {
    const addr = guard();
    if (!addr) return;
    setBusy("Draining reserves");
    setError(null);
    setTx(null);
    try {
      const at = await tokenSigner(addr, signTransaction).transfer({
        from: addr,
        to: SINK,
        amount: usdcToBase(transferAmount),
      });
      const sent = await at.signAndSend();
      setTx({ label: `Drained ${transferAmount} USDC to sink`, hash: sent.sendTransactionResponse?.hash });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header className="flex flex-col gap-2 pt-4">
        <Eyebrow>Issuer console</Eyebrow>
        <h1 className="font-display text-4xl tracking-tight">
          Prove reserves cover liabilities, privately.
        </h1>
        <p className="max-w-2xl text-bone-dim">
          Your holder liabilities and your off-chain reserve composition both stay on this device.
          The circuit proves <span className="text-bone">on-chain&nbsp;USDC + private&nbsp;reserves
          ≥ liabilities</span> without revealing either set. Only two commitments, the verdict, and
          your real USDC balance are public.
        </p>
      </header>

      {!verifierSet && (
        <Panel className="flex flex-col gap-3 border-brass/30 px-5 py-4">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brass">
            <ShieldCheck size={14} /> One-time setup
          </div>
          <p className="text-sm text-bone-dim">
            Activate the verifying key on-chain so the contract can check your proofs. One admin
            transaction signed by your wallet.
          </p>
          <button
            onClick={activateVerifier}
            disabled={!!busy}
            className="self-start rounded-lg border border-brass/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-brass transition hover:bg-brass/10 disabled:opacity-40"
          >
            {busy === "Activating verifier" ? "Signing…" : "Activate verifier"}
          </button>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-5">
          <LedgerCard
            icon={<LockKey size={13} className="text-brass" />}
            title="Holder liabilities · private"
            hint="What you owe your customers. Your real customer book; in the demo it's example data you can edit. Stays in this browser; only a commitment goes on-chain."
            entries={ledger}
            total={liabilitiesBase}
            totalLabel="Total liabilities"
            onEdit={(i, k, v) => edit(setLedger, saveLedger, i, k, v)}
            onAdd={() => add(setLedger, saveLedger, "Holder")}
            onRemove={(i) => remove(setLedger, saveLedger, i)}
          />
          <LedgerCard
            icon={<Bank size={13} className="text-brass" />}
            title="Off-chain reserve sources · private"
            hint="What backs those liabilities, held off-chain with banks/custodians. Composition stays private; it's added to your real on-chain USDC to test solvency."
            entries={sources}
            total={offchainBase}
            totalLabel="Off-chain reserves"
            onEdit={(i, k, v) => edit(setSources, saveSources, i, k, v)}
            onAdd={() => add(setSources, saveSources, "Custodian")}
            onRemove={(i) => remove(setSources, saveSources, i)}
          />
        </div>

        <Panel className="flex flex-col items-center gap-4 p-6">
          <SolvencySeal status={busy ? "none" : status} className="w-40" />
          <div className="grid w-full grid-cols-2 gap-3 text-center">
            <Stat label="On-chain USDC" value={baseToUsdc(reservesBase)} />
            <Stat label="Latest epoch" value={epoch ?? "—"} />
          </div>
          <div className="w-full rounded-lg border border-line bg-ink p-3 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate">
              Total reserves vs liabilities
            </div>
            <div
              className={cn(
                "font-mono text-sm tabular-nums",
                wouldBeSolvent ? "text-proven" : "text-failed",
              )}
            >
              {baseToUsdc(totalReservesBase)} {wouldBeSolvent ? "≥" : "<"} {baseToUsdc(liabilitiesBase)} USDC
            </div>
          </div>
          <div className="flex w-full items-center gap-2">
            <input
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              inputMode="decimal"
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-right font-mono text-sm tabular-nums outline-none focus-visible:border-brass/50 focus-visible:ring-1 focus-visible:ring-brass/30"
              aria-label="Drain amount in USDC"
            />
            <button
              onClick={drain}
              disabled={!!busy}
              className="shrink-0 rounded-lg border border-failed/40 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-failed transition hover:bg-failed/10 disabled:opacity-40"
            >
              Drain USDC
            </button>
          </div>
          <p className="text-center font-mono text-[10px] leading-relaxed text-slate">
            Drain sends real USDC out of your reserve account. Re-fund via the faucet to reset.
          </p>
        </Panel>
      </div>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
        <div className="flex flex-col gap-3 bg-ink p-5">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate">
            <LockKey size={12} /> Stays private (two hidden vectors)
          </span>
          <PrivateList label="Liabilities" entries={ledger} />
          <PrivateList label="Reserve sources" entries={sources} />
        </div>
        <div className="flex flex-col gap-3 bg-ink p-5">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-brass">
            <ShieldCheck size={12} /> Goes on-chain (public)
          </span>
          <dl className="flex flex-col gap-1.5 font-mono text-xs">
            <Row k="Liabilities root" v={proof ? shortHash(proof.liabRootHex, 8) : "—"} />
            <Row k="Reserves root" v={proof ? shortHash(proof.resRootHex, 8) : "—"} />
            <Row k="On-chain USDC" v={baseToUsdc(reservesBase)} />
            <Row
              k="Verdict"
              v={proof ? (proof.solvent ? "SOLVENT" : "INSOLVENT") : status === "none" ? "—" : status.toUpperCase()}
              tone={proof ? (proof.solvent ? "solvent" : "insolvent") : status}
            />
            <Row k="Proof size" v={proof ? "~200 bytes" : "—"} />
            <Row k="Proof (π_a)" v={proof ? shortHash(proof.proof.a.toString("hex"), 6) : "—"} />
          </dl>
          <p className="mt-auto text-[11px] leading-relaxed text-slate">
            Neither total nor composition is published. The contract substitutes your real USDC
            balance as the only public reserve input, so the proof cannot overstate it.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={generateProof}
          disabled={!!busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-brass/40 py-4 text-sm font-medium text-brass transition hover:bg-brass/10 disabled:opacity-50"
        >
          <Lightning size={16} />
          {stage ? STAGE_LABEL[stage] : "Generate proof in browser"}
        </button>
        <button
          onClick={publish}
          disabled={!!busy || !proof}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-bone py-4 text-sm font-medium text-neutral-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60 disabled:opacity-40"
        >
          {busy === "Publishing" ? "Signing & submitting…" : "Sign & publish attestation"}
        </button>
      </div>

      <p className="text-center font-mono text-[10px] leading-relaxed text-slate">
        Proving runs locally in your browser (snarkjs · Groth16): it builds the two Merkle-sum trees,
        computes a witness, and produces a ~200-byte proof. Your balances never leave this page; only
        the proof, the two roots, and the verdict go on-chain.
      </p>

      {(busy === "Proving" || proof) && <ProvingViz stage={stage} proof={proof} />}

      {(tx || error || busy) && (
        <Panel className="px-5 py-4" aria-live="polite">
          {busy && !error && (
            <p className="font-mono text-sm text-bone-dim">{stage ? STAGE_LABEL[stage] : `${busy}…`}</p>
          )}
          {error && <p className="font-mono text-sm text-failed">{error}</p>}
          {tx && !busy && !error && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm text-proven">{tx.label}</span>
              {tx.hash && (
                <a
                  href={explorerTx(tx.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-brass hover:text-bone"
                >
                  View transaction <ArrowSquareOut size={13} />
                </a>
              )}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function ProvingViz({ stage, proof }: { stage: ProveStage | null; proof: PrivateProof | null }) {
  const order: ProveStage[] = ["tree", "witness", "proving"];
  const labels: Record<string, string> = {
    tree: "Building Merkle-sum trees (liabilities + reserves)",
    witness: "Computing witness from your private balances",
    proving: "Generating Groth16 proof on BN254",
  };
  const done = !!proof;
  const activeIdx = stage ? order.indexOf(stage) : done ? order.length : -1;

  return (
    <Panel className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brass">
        <Lightning size={14} /> Zero-knowledge proving · in your browser
      </div>
      <ul className="flex flex-col gap-2">
        {order.map((s, i) => {
          const isDone = done || activeIdx > i;
          const isActive = !done && activeIdx === i;
          return (
            <li key={s} className="flex items-center gap-2.5 font-mono text-xs">
              {isDone ? (
                <CheckCircle size={16} weight="fill" className="text-proven" />
              ) : isActive ? (
                <CircleNotch size={16} className="animate-spin text-brass" />
              ) : (
                <Circle size={16} className="text-slate" />
              )}
              <span className={isDone ? "text-bone-dim" : isActive ? "text-bone" : "text-slate"}>
                {labels[s]}
              </span>
            </li>
          );
        })}
      </ul>
      {proof && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-ink p-3 font-mono text-[11px]">
          <ProofRow k="verdict" v={proof.solvent ? "SOLVENT" : "INSOLVENT"} tone={proof.solvent ? "proven" : "failed"} />
          <ProofRow k="liabilities root" v={shortHash(proof.liabRootHex, 10)} />
          <ProofRow k="reserves root" v={shortHash(proof.resRootHex, 10)} />
          <ProofRow k="π_a" v={shortHash(proof.proof.a.toString("hex"), 10)} />
          <ProofRow k="π_b" v={shortHash(proof.proof.b.toString("hex"), 10)} />
          <ProofRow k="π_c" v={shortHash(proof.proof.c.toString("hex"), 10)} />
          <p className="pt-1 text-[10px] leading-relaxed text-slate">
            Generated locally. These ~200 bytes are everything that proves solvency; your balances
            never left this page.
          </p>
        </div>
      )}
    </Panel>
  );
}

function ProofRow({ k, v, tone }: { k: string; v: string; tone?: "proven" | "failed" }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate">{k}</span>
      <span className={tone === "proven" ? "text-proven" : tone === "failed" ? "text-failed" : "text-bone"}>
        {v}
      </span>
    </div>
  );
}

function LedgerCard({
  icon,
  title,
  hint,
  entries,
  total,
  totalLabel,
  onEdit,
  onAdd,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  entries: LedgerEntry[];
  total: bigint;
  totalLabel: string;
  onEdit: (i: number, key: keyof LedgerEntry, value: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <Panel className="flex flex-col">
      <div className="flex flex-col gap-1.5 border-b border-line px-5 py-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-bone-dim">
            {icon} {title}
          </span>
          <span className="font-mono text-[11px] text-slate">{entries.length}/16</span>
        </div>
        <p className="text-[11px] leading-snug text-slate">{hint}</p>
      </div>
      <div className="flex flex-col divide-y divide-line">
        {entries.map((h, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-2.5">
            <input
              value={h.label}
              onChange={(e) => onEdit(i, "label", e.target.value)}
              spellCheck={false}
              className="w-40 rounded bg-transparent px-1 text-sm text-bone outline-none focus-visible:ring-1 focus-visible:ring-brass/50"
              aria-label="Label"
            />
            <input
              value={h.balance}
              onChange={(e) => onEdit(i, "balance", e.target.value)}
              inputMode="decimal"
              spellCheck={false}
              className="flex-1 rounded bg-transparent px-1 text-right font-mono text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-brass/50"
              aria-label="Amount in USDC"
            />
            <span className="font-mono text-[10px] text-slate">USDC</span>
            <button
              onClick={() => onRemove(i)}
              className="text-slate transition hover:text-failed"
              aria-label="Remove"
            >
              <Trash size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-5 py-3">
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-brass hover:text-bone"
        >
          <Plus size={13} /> Add
        </button>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate">{totalLabel}</div>
          <div className="font-mono text-lg tabular-nums">{baseToUsdc(total)} USDC</div>
        </div>
      </div>
    </Panel>
  );
}

function PrivateList({ label, entries }: { label: string; entries: LedgerEntry[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate">{label}</span>
      <ul className="flex flex-col gap-1 font-mono text-xs text-bone-dim">
        {entries.map((h, i) => (
          <li key={i} className="flex justify-between">
            <span className="text-slate">{h.label}</span>
            <span className="tabular-nums blur-[3px] transition hover:blur-0">{h.balance} USDC</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ k, v, tone = "none" }: { k: string; v: React.ReactNode; tone?: Status }) {
  const toneClass =
    tone === "solvent" ? "text-proven" : tone === "insolvent" ? "text-failed" : "text-bone";
  return (
    <div className="flex justify-between">
      <dt className="text-slate">{k}</dt>
      <dd className={cn("tabular-nums", toneClass)}>{v}</dd>
    </div>
  );
}
