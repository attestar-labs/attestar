import type { SVGProps } from "react";
import { Star } from "@/components/star";

export type MarkProps = SVGProps<SVGSVGElement> & { size?: number };

// A - Seal Star: an attestation ring around the Stellar star. Closest to the live SolvencySeal.
export function MarkSealStar({ size = 24, ...rest }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden {...rest}>
      <circle cx="16" cy="16" r="13.6" strokeWidth="1.4" opacity="0.5" />
      <circle cx="16" cy="16" r="11" strokeWidth="0.7" opacity="0.3" />
      <Star size={14} x={9} y={9} stroke="none" />
    </svg>
  );
}

// B - Check Seal: the ring around a verification check. Reads as "attested".
export function MarkCheckSeal({ size = 24, ...rest }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden {...rest}>
      <circle cx="16" cy="16" r="13.6" strokeWidth="1.4" opacity="0.5" />
      <circle cx="16" cy="16" r="11" strokeWidth="0.7" opacity="0.3" />
      <path
        d="M10.3 16.4 L14.2 20.3 L21.7 11.6"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// C - North Star: the Stellar star alone, no ring. Minimal, scales tiny.
export function MarkNorthStar({ size = 24, ...rest }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden {...rest}>
      <Star size={25} x={3.5} y={3.5} stroke="none" />
    </svg>
  );
}

// D - Solvency Shield: a shield holding the star. Backing and protection.
export function MarkShield({ size = 24, ...rest }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden {...rest}>
      <path
        d="M16 3 L27 7 V15.5 C27 22.4 22.2 26.8 16 29 C9.8 26.8 5 22.4 5 15.5 V7 Z"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <Star size={13} x={9.5} y={8} stroke="none" />
    </svg>
  );
}

export const MARKS = [
  {
    id: "seal-star",
    label: "Seal Star",
    sub: "An attestation ring around the Stellar star. Heritage and authority, closest to the live SolvencySeal.",
    Mark: MarkSealStar,
  },
  {
    id: "check-seal",
    label: "Check Seal",
    sub: "The same ring around a verification check. Reads instantly as attested and verified.",
    Mark: MarkCheckSeal,
  },
  {
    id: "north-star",
    label: "North Star",
    sub: "The Stellar star alone, no ring. The most minimal option, sharpest at favicon sizes.",
    Mark: MarkNorthStar,
  },
  {
    id: "shield",
    label: "Solvency Shield",
    sub: "A shield holding the star. Leans into backing, reserves, and protection.",
    Mark: MarkShield,
  },
] as const;

export type MarkId = (typeof MARKS)[number]["id"];
