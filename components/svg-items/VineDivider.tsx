/**
 * VineDivider — a branching vine rule with alternating leaves, buds, curling
 * tendrils and a small open bloom at the centre.
 *
 * Hand-authored inline SVG divider (server component, no client JS). The stem
 * fades out at both ends via a namespaced gradient (`cwsi-vine-*`); one leaf
 * shape is hand-drawn once and placed along the stem with individual rotation
 * and flip so no two sit identically. All paint reads the cw-* palette tokens
 * with the engine fallback chain.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */
import type { ReactElement } from "react";

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const OKER_DEEP =
  "var(--color-cw-gold-deep, var(--color-cw-oker-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** One almond leaf growing from the origin, with a single sweeping vein. */
function Leaf({
  x,
  y,
  angle,
  flip,
  warm,
}: {
  x: number;
  y: number;
  angle: number;
  flip?: boolean;
  warm?: boolean;
}): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})${flip ? " scale(1 -1)" : ""}`}>
      <path
        d="M0 0 C 2.5 -5, 7.5 -8.5, 13 -8 C 11 -3.5, 6 -0.5, 0 0 Z"
        fill={warm ? OKER : ACCENT}
        fillOpacity={warm ? 0.7 : 0.8}
        stroke={warm ? OKER_DEEP : ACCENT_DEEP}
        strokeOpacity="0.5"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path
        d="M1.5 -1 C 5 -3.2, 8.5 -5.2, 11.8 -7"
        fill="none"
        stroke={CREAM}
        strokeOpacity="0.55"
        strokeWidth="0.75"
        strokeLinecap="round"
      />
    </g>
  );
}

/** A closed bud on a short stalk: two calyx strokes cupping a round head. */
function Bud({ x, y, angle }: { x: number; y: number; angle: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d="M0 0 L0 -4" stroke={MUTED} strokeOpacity="0.7" strokeWidth="0.75" strokeLinecap="round" />
      <circle cx="0" cy="-5.6" r="1.9" fill={ACCENT_DEEP} fillOpacity="0.85" />
      <circle cx="-0.5" cy="-6.1" r="0.6" fill={CREAM} fillOpacity="0.7" />
      <path
        d="M-1.6 -4.4 Q -2.4 -5.8 -1.9 -7.2 M1.6 -4.4 Q 2.4 -5.8 1.9 -7.2"
        fill="none"
        stroke={MUTED}
        strokeOpacity="0.6"
        strokeWidth="0.75"
        strokeLinecap="round"
      />
    </g>
  );
}

/** A curling tendril reaching off the stem. */
function Tendril({ x, y, flip }: { x: number; y: number; flip?: boolean }): ReactElement {
  return (
    <g transform={`translate(${x} ${y})${flip ? " scale(1 -1)" : ""}`}>
      <path
        d="M0 0 C 3.5 -2.5, 7 -2.2, 7.6 0.4 C 8 2.6, 5.8 3.6, 4.4 2.3 C 3.4 1.4, 4.2 0.2, 5.3 0.5"
        fill="none"
        stroke={MUTED}
        strokeOpacity="0.65"
        strokeWidth="0.75"
        strokeLinecap="round"
      />
    </g>
  );
}

export function VineDivider({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="cwsi-vine-stem" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={INK} stopOpacity="0" />
          <stop offset="0.08" stopColor={INK} stopOpacity="0.55" />
          <stop offset="0.92" stopColor={INK} stopOpacity="0.55" />
          <stop offset="1" stopColor={INK} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The stem — one breathing curve across the full width */}
      <path
        d="M4 12 C 36 5, 64 19, 96 12 C 128 5, 156 19, 188 12 C 220 5, 248 19, 280 12 C 312 5, 340 19, 372 12 L 396 11.5"
        fill="none"
        stroke="url(#cwsi-vine-stem)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* A thin secondary runner shadowing the stem */}
      <path
        d="M30 14.5 C 60 18.5, 80 8, 110 11"
        fill="none"
        stroke={MUTED}
        strokeOpacity="0.3"
        strokeWidth="0.75"
        strokeLinecap="round"
      />
      <path
        d="M290 13 C 320 16.5, 340 7.5, 368 10.5"
        fill="none"
        stroke={MUTED}
        strokeOpacity="0.3"
        strokeWidth="0.75"
        strokeLinecap="round"
      />

      {/* Leaves — alternating above/below, no two at the same angle */}
      <Leaf x={30} y={9.4} angle={-32} />
      <Leaf x={56} y={13.8} angle={28} flip warm />
      <Leaf x={84} y={11.6} angle={-20} />
      <Leaf x={118} y={9.6} angle={-40} warm />
      <Leaf x={146} y={15.4} angle={24} flip />
      <Leaf x={172} y={12.4} angle={-26} warm />
      <Leaf x={228} y={9.6} angle={-34} />
      <Leaf x={254} y={14.6} angle={30} flip warm />
      <Leaf x={282} y={11.6} angle={-22} />
      <Leaf x={316} y={9.8} angle={-38} warm />
      <Leaf x={344} y={15.2} angle={26} flip />
      <Leaf x={370} y={11.4} angle={-28} warm />

      {/* Buds between the leaves */}
      <Bud x={70} y={12.6} angle={-14} />
      <Bud x={132} y={11.4} angle={10} />
      <Bud x={268} y={12.6} angle={-10} />
      <Bud x={330} y={11.6} angle={14} />

      {/* Tendrils curling off the runners */}
      <Tendril x={104} y={11.2} />
      <Tendril x={160} y={13.6} flip />
      <Tendril x={242} y={10.8} />
      <Tendril x={356} y={13.4} flip />

      {/* Centre bloom — five petals around a warm heart */}
      <g transform="translate(200 11)">
        <g fill={ACCENT} fillOpacity="0.85" stroke={ACCENT_DEEP} strokeOpacity="0.4" strokeWidth="0.75">
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" />
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" transform="rotate(72)" />
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" transform="rotate(144)" />
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" transform="rotate(216)" />
          <ellipse cx="0" cy="-4.4" rx="2" ry="3.1" transform="rotate(288)" />
        </g>
        <circle r="2" fill={OKER} />
        <circle r="0.8" fill={OKER_DEEP} />
        <circle cx="-0.6" cy="-0.6" r="0.4" fill={CREAM} fillOpacity="0.9" />
      </g>

      {/* Pollen drifting off the bloom and the buds */}
      <circle cx="192" cy="4.5" r="0.7" fill={OKER} fillOpacity="0.5" />
      <circle cx="209" cy="5.5" r="0.6" fill={ACCENT} fillOpacity="0.45" />
      <circle cx="204" cy="19" r="0.5" fill={OKER} fillOpacity="0.4" />
      <circle cx="74" cy="5.5" r="0.5" fill={ACCENT} fillOpacity="0.35" />
      <circle cx="326" cy="5" r="0.5" fill={ACCENT} fillOpacity="0.35" />
    </svg>
  );
}
