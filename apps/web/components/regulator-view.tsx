"use client";

import { Buffer } from "buffer";
import { useCallback, useEffect, useState } from "react";
import { Scales, Wallet, Key, LockKeyOpen, LockKey, EyeSlash } from "@phosphor-icons/react";
import { useWallet } from "@/lib/wallet";
import { attestarReader } from "@/lib/contracts";
import { decryptDisclosure, loadDisclosure, DEFAULT_VIEW_KEY } from "@/lib/disclosure";
import { sumBase, type LedgerEntry } from "@/lib/ledger";
import { Panel, Eyebrow, Stat } from "@/components/panel";
import { baseToUsdc, shortHash, usdcToBase } from "@/lib/format";

interface Public {
  epoch: string;
  solvent: boolean;
  liabRootHex: string;
  resRootHex: string;
  onchainBase: bigint;
}

interface Revealed {
  ledger: LedgerEntry[];
  sources: LedgerEntry[];
  onchain: string;
  solvent: boolean;
}

// Returns a message for the first disclosed row whose balance cannot be
// converted, so a package written by an older build renders an error instead of
// throwing during render. Summing itself goes through the shared ledger helper.
function firstUnparseable(entries: LedgerEntry[]): string | null {
  for (const e of entries) {
    try {
      usdcToBase(e.balance);
    } catch (err) {
      return `Disclosed row "${e.label || "unnamed"}" has an unparseable balance (${e.balance}): ${
        (err as Error).message
      }`;
    }
  }
  return null;
}

export function RegulatorView() {
  const { address, connect, connecting, signMessage } = useWallet();
  const [pub, setPub] = useState<Public | null>(null);
  const [viewKey, setViewKey] = useState(DEFAULT_VIEW_KEY);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const latest = await attestarReader().latest().then((t) => t.result);
      if (latest) {
        setPub({
          epoch: latest.epoch.toString(),
          solvent: latest.solvent,
          liabRootHex: Buffer.from(latest.liab_root).toString("hex"),
          resRootHex: Buffer.from(latest.res_root).toString("hex"),
          onchainBase: BigInt(latest.onchain_reserves),
        });
      } else {
        // A fresh deployment (or a chain reset) has no attestation: clear the
        // panel so switching between contract ids never shows a stale epoch.
        setPub(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function unlock() {
    setBusy(true);
    setError(null);
    setRevealed(null);
    try {
      await signMessage(`Attestar audit access · epoch ${pub?.epoch ?? "?"}`);
      const p = loadDisclosure();
      if (!p) {
        setError("No disclosure package found. Ask the issuer to publish an attestation first.");
        return;
      }
      const data = (await decryptDisclosure(p, viewKey)) as Revealed;
      setRevealed(data);
    } catch (e) {
      const msg = (e as Error).message;
      setError(/operation-specific|decrypt/i.test(msg) ? "Wrong view key." : msg);
    } finally {
      setBusy(false);
    }
  }

  const liabilityRows = revealed?.ledger ?? [];
  const sourceRows = revealed?.sources ?? [];
  const disclosureError = revealed ? firstUnparseable([...liabilityRows, ...sourceRows]) : null;
  const liabTotal = revealed ? sumBase(liabilityRows) : 0n;
  const offchainTotal = revealed ? sumBase(sourceRows) : 0n;
  const onchainTotal = revealed ? BigInt(revealed.onchain) : 0n;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header className="flex flex-col gap-2 pt-4">
        <Eyebrow>Regulator console</Eyebrow>
        <h1 className="font-display text-4xl tracking-tight">Selective disclosure, on demand.</h1>
        <p className="max-w-2xl text-bone-dim">
          The public ledger shows only the verdict and two commitments. As the authorized auditor you
          hold a view key that reconstructs the full liability and reserve composition that no one
          else can see. This is the GENIUS Act / MiCA pattern: regulators get account-level detail on
          demand, while the public and competitors never do.
        </p>
      </header>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
        <div className="flex flex-col gap-3 bg-ink p-5">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate">
            <EyeSlash size={12} /> What the public sees
          </span>
          <dl className="flex flex-col gap-1.5 font-mono text-xs">
            <Row k="Epoch" v={pub?.epoch ?? "—"} />
            <Row
              k="Verdict"
              v={pub ? (pub.solvent ? "SOLVENT" : "INSOLVENT") : "—"}
              cls={pub?.solvent ? "text-proven" : "text-failed"}
            />
            <Row k="Liabilities root" v={shortHash(pub?.liabRootHex, 8)} />
            <Row k="Reserves root" v={shortHash(pub?.resRootHex, 8)} />
            <Row k="On-chain USDC" v={pub ? `${baseToUsdc(pub.onchainBase)} USDC` : "—"} />
            <Row k="Compositions & totals" v="hidden" cls="text-slate" />
          </dl>
          {!pub && (
            <p className="font-mono text-[10px] text-slate">No attestation published yet.</p>
          )}
        </div>

        <div className="flex flex-col gap-3 bg-ink p-5">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-brass">
            {revealed ? <LockKeyOpen size={12} /> : <LockKey size={12} />} What the view key reveals
          </span>
          {revealed ? (
            <div className="flex flex-col gap-3">
              <Composition title="Liabilities" entries={revealed.ledger} total={liabTotal} />
              <Composition title="Off-chain reserves" entries={revealed.sources} total={offchainTotal} />
              <div className="flex justify-between border-t border-line pt-1.5 font-mono text-xs">
                <span className="text-slate">On-chain + off-chain reserves</span>
                <span className="tabular-nums text-brass">
                  {baseToUsdc(onchainTotal + offchainTotal)} USDC
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-6 text-center font-mono text-xs text-slate">
              Locked. Connect the auditor wallet and provide the view key.
            </div>
          )}
        </div>
      </div>

      {!address ? (
        <Panel className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-brass/30 text-brass">
            <Scales size={22} weight="light" />
          </span>
          <p className="max-w-md text-bone-dim">Connect the authorized auditor wallet to request disclosure.</p>
          <button
            onClick={() => connect("regulator")}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-full bg-bone px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-50"
          >
            <Wallet size={15} /> {connecting ? "Connecting…" : "Connect Freighter"}
          </button>
        </Panel>
      ) : (
        <Panel className="flex flex-col gap-4 px-5 py-5">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-bone-dim">
            <Key size={14} className="text-brass" /> View key
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={viewKey}
              onChange={(e) => setViewKey(e.target.value)}
              spellCheck={false}
              className="flex-1 rounded-lg border border-line bg-ink px-3 py-2 font-mono text-sm outline-none focus-visible:border-brass/50 focus-visible:ring-1 focus-visible:ring-brass/30"
              aria-label="View key"
            />
            <button
              onClick={unlock}
              disabled={busy}
              className="rounded-xl bg-bone px-5 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-40"
            >
              {busy ? "Unlocking…" : "Sign & unlock disclosure"}
            </button>
          </div>
          <p className="font-mono text-[11px] text-slate">
            Unlocking signs an audit-access message with your wallet, then decrypts the issuer&apos;s
            disclosure package (AES-GCM) with the view key.
          </p>
          {error && <p className="font-mono text-sm text-failed" aria-live="polite">{error}</p>}
          {disclosureError && (
            <p className="font-mono text-sm text-failed" aria-live="polite">{disclosureError}</p>
          )}
          {revealed && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Disclosed accounts" value={revealed.ledger.length + revealed.sources.length} />
              <Stat
                label="Reserves cover liabilities"
                value={onchainTotal + offchainTotal >= liabTotal ? "Yes" : "No"}
                tone={onchainTotal + offchainTotal >= liabTotal ? "proven" : "failed"}
              />
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function Composition({
  title,
  entries,
  total,
}: {
  title: string;
  entries: LedgerEntry[];
  total: bigint;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate">{title}</span>
      <ul className="flex flex-col gap-1 font-mono text-xs">
        {entries.map((h, i) => (
          <li key={i} className="flex justify-between">
            <span className="text-bone-dim">{h.label}</span>
            <span className="tabular-nums text-bone">{h.balance} USDC</span>
          </li>
        ))}
        <li className="flex justify-between border-t border-line pt-1 text-slate">
          <span>Subtotal</span>
          <span className="tabular-nums">{baseToUsdc(total)} USDC</span>
        </li>
      </ul>
    </div>
  );
}

function Row({ k, v, cls = "text-bone" }: { k: string; v: React.ReactNode; cls?: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate">{k}</dt>
      <dd className={`tabular-nums ${cls}`}>{v}</dd>
    </div>
  );
}
