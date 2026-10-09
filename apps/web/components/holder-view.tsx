"use client";

import { Buffer } from "buffer";
import { useCallback, useEffect, useState } from "react";
import { User, ShieldCheck, Wallet, SealCheck, Warning } from "@phosphor-icons/react";
import { useWallet } from "@/lib/wallet";
import { attestarReader } from "@/lib/contracts";
import { loadLedger, matchByAddress, type LedgerEntry } from "@/lib/ledger";
import {
  loadStoredProofAtIndex,
  loadStoredProofForUser,
  verifyStoredInclusion,
} from "@/lib/inclusion-store";
import { decodeAttestation } from "@/lib/attestation-record";
import { inclusionForBrowser } from "@/lib/prover-browser";
import { loadLedger, toHolders, matchByAddress, type LedgerEntry } from "@/lib/ledger";
import { Panel, Eyebrow, Stat } from "@/components/panel";
import { baseToUsdc, shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Published {
  epoch: string;
  solvent: boolean;
  liabRootHex: string;
}

interface InclusionView {
  ok: boolean;
  balance: string;
  rootHex: string;
  stale: boolean;
  tampered: boolean;
}

export function HolderView() {
  const { address, connect, connecting } = useWallet();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [published, setPublished] = useState<Published | null>(null);
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<InclusionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLedger(loadLedger());
  }, []);

  useEffect(() => {
    if (address) {
      const i = matchByAddress(loadLedger(), address);
      if (i >= 0) setSelected(i);
    }
  }, [address]);

  const refresh = useCallback(async () => {
    try {
      const latest = await attestarReader().latest().then((t) => t.result);
      if (latest) {
        const record = decodeAttestation(latest);
        setPublished({
          epoch: record.epoch.toString(),
          solvent: record.solvent,
          liabRootHex: Buffer.from(record.liabRoot).toString("hex"),
        });
      } else {
        setPublished(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function verify() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (!published) {
        setError("No attestation published yet. Publish one from the Issuer console first.");
        return;
      }
      const entry = ledger[selected];
      // Prefer the path the issuer persisted for this exact holder; fall back to
      // the path stored at this ledger position.
      const stored =
        (entry ? loadStoredProofForUser(entry.userId) : null) ?? loadStoredProofAtIndex(selected);
      if (!stored) {
        setError(
          "No inclusion path is stored on this device. The issuer must generate and publish an attestation first.",
        );
        return;
      }
      // Fold the STORED path and compare it with the on-chain root, instead of
      // rebuilding a tree from the current ledger (which would always pass).
      const res = await verifyStoredInclusion(stored, published.liabRootHex);
      setResult({
        ok: res.ok,
        balance: res.balance,
        rootHex: res.rootHex,
        stale: res.stale,
        tampered: res.tampered,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const who = ledger[selected]?.label ?? "this holder";

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header className="flex flex-col gap-2 pt-4">
        <Eyebrow>Holder console</Eyebrow>
        <h1 className="font-display text-4xl tracking-tight">Confirm a holder was counted.</h1>
        <p className="max-w-2xl text-bone-dim">
          Here you step into a customer&apos;s shoes. A holder should not have to trust the
          issuer&apos;s total. They verify their own balance is included in the liabilities the proof
          committed to, seeing only their own number.
        </p>
      </header>

      {!address ? (
        <Panel className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-brass/30 text-brass">
            <User size={22} weight="light" />
          </span>
          <p className="max-w-md text-bone-dim">Connect a wallet to act as a holder.</p>
          <button
            onClick={() => connect("holder")}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-full bg-bone px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-50"
          >
            <Wallet size={15} /> {connecting ? "Connecting…" : "Connect Freighter"}
          </button>
        </Panel>
      ) : (
        <>
          <Panel className="border-brass/20 px-5 py-3">
            <p className="text-[12px] leading-relaxed text-bone-dim">
              Demo note: in production a holder is matched to their own wallet automatically. Here you
              just pick which customer to act as. The balance you see is what the issuer{" "}
              <span className="text-bone">owes that customer</span>, a liability. It is not the USDC in
              your wallet, that is the issuer&apos;s separate reserve.
            </p>
          </Panel>

          <Panel className="grid gap-4 px-5 py-4 sm:grid-cols-3">
            <Stat label="Latest epoch" value={published?.epoch ?? "—"} />
            <Stat
              label="Public verdict"
              value={published ? (published.solvent ? "Solvent" : "Insolvent") : "—"}
              tone={published ? (published.solvent ? "proven" : "failed") : "default"}
            />
            <Stat label="Liabilities root" value={shortHash(published?.liabRootHex, 6)} />
          </Panel>

          <Panel className="flex flex-col gap-4 px-5 py-5">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-bone-dim">
              <ShieldCheck size={14} className="text-brass" /> Verify as a holder
            </div>
            <p className="text-sm text-bone-dim">
              Acting as <span className="text-bone">{who}</span>. Pick a different customer if you like,
              then verify.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {ledger.map((h, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "rounded-full border px-3 py-1 font-mono text-xs transition",
                    selected === i
                      ? "border-brass/60 bg-brass/10 text-bone"
                      : "border-line text-bone-dim hover:border-brass/40 hover:text-bone",
                  )}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <button
              onClick={verify}
              disabled={busy}
              className="self-start rounded-xl bg-bone px-5 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-40"
            >
              {busy ? "Verifying…" : `Verify ${who}'s inclusion`}
            </button>
            {!published && (
              <p className="font-mono text-xs text-slate">
                No attestation published yet. Publish one from the Issuer console first.
              </p>
            )}
          </Panel>

          {error && (
            <Panel className="px-5 py-4" aria-live="polite">
              <p className="font-mono text-sm text-failed">{error}</p>
            </Panel>
          )}

          {result && (
            <Panel
              className={cn(
                "flex flex-col gap-3 px-5 py-5",
                result.ok ? "border-proven/40" : "border-failed/40",
              )}
              aria-live="polite"
            >
              <div
                className={cn(
                  "inline-flex items-center gap-2 font-mono text-sm",
                  result.ok ? "text-proven" : "text-failed",
                )}
              >
                {result.ok ? <SealCheck size={18} /> : <Warning size={18} />}
                {result.ok
                  ? `${who}'s balance is committed in the proof the chain verified.`
                  : result.stale
                    ? "The stored tree is stale. It does not match the root the chain recorded; re-publish from the Issuer console."
                    : result.tampered
                      ? "The stored inclusion path failed verification; it may have been tampered with."
                      : "Inclusion check failed."}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat
                  label={`What the issuer owes ${who} (a liability)`}
                  value={`${baseToUsdc(result.balance)} USDC`}
                />
                <Stat
                  label="Root matches on-chain"
                  value={result.ok ? "Yes" : "No"}
                  tone={result.ok ? "proven" : "failed"}
                />
              </div>
              <p className="font-mono text-[11px] text-slate">
                stored {shortHash(result.rootHex, 8)} · on-chain {shortHash(published?.liabRootHex, 8)}
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
