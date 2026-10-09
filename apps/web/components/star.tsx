import type { SVGProps } from "react";

// The Attestar mark: the four-pointed Stellar star. This is the single source of the
// path string; every component that draws the mark imports it from here.
export const STAR_PATH =
  "M12 1.5c.3 4.8 1.9 6.4 6.7 6.7v.6c-4.8.3-6.4 1.9-6.7 6.7h-.6c-.3-4.8-1.9-6.4-6.7-6.7v-.6c4.8-.3 6.4-1.9 6.7-6.7z";

export type StarProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  /** Square edge length in px; sets both width and height. */
  size?: number;
};

export function Star({ size = 24, className, ...rest }: StarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      {...rest}
    >
      <path d={STAR_PATH} />
    </svg>
  );
}
