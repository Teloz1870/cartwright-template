import type { CSSProperties } from "react";
/**
 * LatticeMark — an interlaced geometric rosette: two squares and a circle
 * woven over-and-under, with a fine diagonal lattice at the heart.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * The weave is real: short over-segments are redrawn at alternating
 * crossings so each strand passes over, then under. All paint reads the
 * cw-* palette tokens with the engine fallback chain.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

export function LatticeMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className} style={style}
    >
      <defs>
        <clipPath id="cwsi-lattice-heart">
          <circle cx="60" cy="60" r="25" />
        </clipPath>
      </defs>

      {/* Outer reference circle */}
      <circle cx="60" cy="60" r="46" fill="none" stroke={INK} strokeOpacity="0.18" strokeWidth="0.75" />

      {/* Strand 1 — the diamond (square rotated 45°), drawn first (lowest) */}
      <path
        d="M60 16 L104 60 L60 104 L16 60 Z"
        fill="none"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.8"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Strand 2 — the circle, woven over the diamond, under the square */}
      <circle cx="60" cy="60" r="35" fill="none" stroke={OKER} strokeOpacity="0.75" strokeWidth="1.25" />

      {/* Strand 3 — the upright square, drawn last (highest) */}
      <path
        d="M29 29 L91 29 L91 91 L29 91 Z"
        fill="none"
        stroke={ACCENT}
        strokeOpacity="0.85"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Weave pass A — the diamond climbs back OVER the square at four
          alternating crossings (short redraws along the diamond's edges) */}
      <g stroke={ACCENT_DEEP} strokeOpacity="0.8" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M69 25 L77 33" />
        <path d="M95 69 L87 77" />
        <path d="M51 95 L43 87" />
        <path d="M25 51 L33 43" />
      </g>

      {/* Weave pass B — the circle rises OVER the square at the opposite four
          crossings (short arc redraws on the r=35 circle) */}
      <g stroke={OKER} strokeOpacity="0.75" strokeWidth="1.25" fill="none" strokeLinecap="round">
        <path d="M72.5 27.3 A 35 35 0 0 1 80.1 31.3" />
        <path d="M92.7 72.5 A 35 35 0 0 1 88.7 80.1" />
        <path d="M47.5 92.7 A 35 35 0 0 1 39.9 88.7" />
        <path d="M27.3 47.5 A 35 35 0 0 1 31.3 39.9" />
      </g>

      {/* Heart — a fine diagonal lattice clipped to the inner circle */}
      <g clipPath="url(#cwsi-lattice-heart)">
        <g stroke={INK} strokeOpacity="0.22" strokeWidth="0.75">
          <path d="M22 74 L74 22" />
          <path d="M28 92 L92 28" />
          <path d="M46 98 L98 46" />
          <path d="M22 46 L74 98" />
          <path d="M28 28 L92 92" />
          <path d="M46 22 L98 74" />
        </g>
        {/* Accent beads where the lattice crosses near the centre */}
        <circle cx="60" cy="60" r="1.5" fill={ACCENT_DEEP} fillOpacity="0.9" />
        <circle cx="48" cy="60" r="1" fill={ACCENT} fillOpacity="0.6" />
        <circle cx="72" cy="60" r="1" fill={ACCENT} fillOpacity="0.6" />
        <circle cx="60" cy="48" r="1" fill={OKER} fillOpacity="0.6" />
        <circle cx="60" cy="72" r="1" fill={OKER} fillOpacity="0.6" />
      </g>
      <circle cx="60" cy="60" r="25" fill="none" stroke={MUTED} strokeOpacity="0.45" strokeWidth="0.75" />

      {/* Cardinal pearls on the diamond's points */}
      <circle cx="60" cy="16" r="1.5" fill={ACCENT_DEEP} fillOpacity="0.9" />
      <circle cx="104" cy="60" r="1.5" fill={ACCENT_DEEP} fillOpacity="0.9" />
      <circle cx="60" cy="104" r="1.5" fill={ACCENT_DEEP} fillOpacity="0.9" />
      <circle cx="16" cy="60" r="1.5" fill={ACCENT_DEEP} fillOpacity="0.9" />
      {/* Smaller warm pearls on the square's corners */}
      <circle cx="29" cy="29" r="1.1" fill={OKER} fillOpacity="0.8" />
      <circle cx="91" cy="29" r="1.1" fill={OKER} fillOpacity="0.8" />
      <circle cx="91" cy="91" r="1.1" fill={OKER} fillOpacity="0.8" />
      <circle cx="29" cy="91" r="1.1" fill={OKER} fillOpacity="0.8" />
      {/* Hairline ticks marking the outer circle's cardinal points */}
      <g stroke={INK} strokeOpacity="0.3" strokeWidth="0.75" strokeLinecap="round">
        <path d="M60 11.5 L60 14.5" />
        <path d="M105.5 60 L108.5 60" />
        <path d="M60 105.5 L60 108.5" />
        <path d="M11.5 60 L14.5 60" />
      </g>
    </svg>
  );
}
