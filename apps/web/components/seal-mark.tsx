import { Star } from "@/components/star";

export function SealMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="16" cy="16" r="13.6" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeOpacity="0.28" strokeWidth="0.8" />
      <Star size={14} x={9} y={9} />
    </svg>
  );
}
