import { cn } from "@/lib/cn";
import { Star } from "@/components/star";

type Status = "solvent" | "insolvent" | "none";

const RING_TEXT = "ZERO-KNOWLEDGE PROOF OF RESERVES · VERIFIED ON STELLAR · ";

export function SolvencySeal({ status, className }: { status: Status; className?: string }) {
  const accent =
    status === "solvent"
      ? "text-proven"
      : status === "insolvent"
        ? "text-failed"
        : "text-slate";
  const glow =
    status === "solvent"
      ? "rgba(70,198,138,0.18)"
      : status === "insolvent"
        ? "rgba(229,86,75,0.18)"
        : "rgba(107,111,118,0.12)";
  const word = status === "solvent" ? "SOLVENT" : status === "insolvent" ? "INSOLVENT" : "AWAITING";

  return (
    <div className={cn("relative aspect-square w-64 select-none", className)}>
      <div
        className="absolute inset-0 motion-safe:animate-[seal-rotate_40s_linear_infinite]"
        style={{ transformOrigin: "center" }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 240 240" className="h-full w-full">
          <defs>
            <path
              id="seal-ring"
              d="M120,120 m-96,0 a96,96 0 1,1 192,0 a96,96 0 1,1 -192,0"
              fill="none"
            />
          </defs>
          <text className="fill-brass font-mono uppercase" style={{ fontSize: 9, letterSpacing: 3 }}>
            <textPath href="#seal-ring" startOffset="0">
              {RING_TEXT.repeat(3)}
            </textPath>
          </text>
        </svg>
      </div>

      <div
        className="absolute inset-[18px] rounded-full border border-brass/30 bg-ink-raised"
        style={{ boxShadow: `inset 0 0 60px ${glow}, 0 0 1px rgba(200,168,106,0.4)` }}
      />
      <div className="absolute inset-[18px] rounded-full border border-brass/15" />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <Star className={cn("h-5 w-5", accent)} />
        <div className={cn("font-display text-2xl tracking-tight", accent)}>{word}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-bone-dim">
          {status === "none" ? "no attestation" : "ZK proof verified"}
        </div>
      </div>
    </div>
  );
}
