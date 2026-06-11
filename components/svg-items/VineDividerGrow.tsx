/**
 * VineDividerGrow — a vine rule that draws itself in as it scrolls into view,
 * leaves and buds fading in behind the growing stem.
 *
 * Hand-authored ANIMATED inline SVG divider (server component, no client JS).
 * The draw-in rides the scroll position via `animation-timeline: view()`,
 * double-gated behind `@media (prefers-reduced-motion: no-preference)` AND
 * `@supports (animation-timeline: view())` — browsers without scroll-driven
 * animations (and reduced-motion users) simply see the fully drawn vine.
 * The stem uses `pathLength={1}` so the dash math is exact. All paint reads
 * the cw-* palette tokens with the engine fallback chain; styles are
 * namespaced (`cwsi-vinegrow-*`).
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */
import type { ReactElement } from "react";

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const OKER_DEEP = "var(--color-cw-gold-deep, var(--color-cw-oker-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/**
 * Scroll-driven draw-in. The visible default (outside both gates) is the
 * complete vine; inside, the stem draws left→right across the view-timeline
 * window and the foliage fades in along it in three waves.
 */
const VINEGROW_CSS = `
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .cwsi-vinegrow-stem {
      stroke-dasharray: 1;
      animation: cwsi-vinegrow-draw linear both;
      animation-timeline: view();
      animation-range: entry 10% cover 45%;
    }
    .cwsi-vinegrow-leaf {
      animation: cwsi-vinegrow-fade linear both;
      animation-timeline: view();
      animation-range: entry 25% cover 55%;
    }
    .cwsi-vinegrow-mid { animation-range: entry 40% cover 65%; }
    .cwsi-vinegrow-late { animation-range: entry 55% cover 80%; }
    @keyframes cwsi-vinegrow-draw {
      from { stroke-dashoffset: 1; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes cwsi-vinegrow-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  }
}
`;

/** One almond leaf growing from the origin, with a single sweeping vein. */
function GrowLeaf({
  x,
  y,
  angle,
  flip,
  warm,
  wave,
}: {
  x: number;
  y: number;
  angle: number;
  flip?: boolean;
  warm?: boolean;
  wave?: "mid" | "late";
}): ReactElement {
  return (
    <g
      className={`cwsi-vinegrow-leaf${wave ? ` cwsi-vinegrow-${wave}` : ""}`}
      transform={`translate(${x} ${y}) rotate(${angle})${flip ? " scale(1 -1)" : ""}`}
    >
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
function GrowBud({
  x,
  y,
  angle,
  wave,
}: {
  x: number;
  y: number;
  angle: number;
  wave?: "mid" | "late";
}): ReactElement {
  return (
    <g
      className={`cwsi-vinegrow-leaf${wave ? ` cwsi-vinegrow-${wave}` : ""}`}
      transform={`translate(${x} ${y}) rotate(${angle})`}
    >
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

export function VineDividerGrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="cwsi-vinegrow-stem" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={INK} stopOpacity="0" />
          <stop offset="0.08" stopColor={INK} stopOpacity="0.55" />
          <stop offset="0.92" stopColor={INK} stopOpacity="0.55" />
          <stop offset="1" stopColor={INK} stopOpacity="0" />
        </linearGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: VINEGROW_CSS }} />

      {/* The stem — one breathing curve, drawn in by the scroll timeline */}
      <path
        className="cwsi-vinegrow-stem"
        d="M4 12 C 40 4, 72 20, 108 12 C 144 4, 176 20, 212 12 C 248 4, 280 20, 316 12 C 344 6, 368 17, 396 11.5"
        pathLength={1}
        fill="none"
        stroke="url(#cwsi-vinegrow-stem)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      {/* Leaves — three fade-in waves trailing the growing tip */}
      <GrowLeaf x={34} y={9.6} angle={-32} />
      <GrowLeaf x={62} y={14.2} angle={28} flip warm />
      <GrowLeaf x={92} y={11.8} angle={-22} />
      <GrowLeaf x={138} y={9.6} angle={-38} warm wave="mid" />
      <GrowLeaf x={166} y={15.2} angle={24} flip wave="mid" />
      <GrowLeaf x={196} y={11.6} angle={-26} warm wave="mid" />
      <GrowLeaf x={262} y={9.8} angle={-34} wave="late" />
      <GrowLeaf x={292} y={14.8} angle={30} flip warm wave="late" />
      <GrowLeaf x={348} y={9.8} angle={-30} wave="late" />

      {/* Buds between the leaves, joining their nearest wave */}
      <GrowBud x={78} y={12.6} angle={-14} />
      <GrowBud x={182} y={11.6} angle={10} wave="mid" />
      <GrowBud x={324} y={11.8} angle={-10} wave="late" />

      {/* The growing tip's reward — a small open bloom at the far end */}
      <g className="cwsi-vinegrow-leaf cwsi-vinegrow-late" transform="translate(374 10.5)">
        <g fill={ACCENT} fillOpacity="0.85" stroke={ACCENT_DEEP} strokeOpacity="0.4" strokeWidth="0.75">
          <ellipse cx="0" cy="-3.6" rx="1.7" ry="2.6" />
          <ellipse cx="0" cy="-3.6" rx="1.7" ry="2.6" transform="rotate(72)" />
          <ellipse cx="0" cy="-3.6" rx="1.7" ry="2.6" transform="rotate(144)" />
          <ellipse cx="0" cy="-3.6" rx="1.7" ry="2.6" transform="rotate(216)" />
          <ellipse cx="0" cy="-3.6" rx="1.7" ry="2.6" transform="rotate(288)" />
        </g>
        <circle r="1.7" fill={OKER} />
        <circle r="0.7" fill={OKER_DEEP} />
        <circle cx="-0.5" cy="-0.5" r="0.35" fill={CREAM} fillOpacity="0.9" />
      </g>

      {/* Pollen hanging in the air (always present — keeps the static frame alive) */}
      <circle cx="118" cy="5" r="0.6" fill={ACCENT} fillOpacity="0.35" />
      <circle cx="236" cy="4.5" r="0.6" fill={OKER} fillOpacity="0.4" />
      <circle cx="366" cy="4.5" r="0.5" fill={ACCENT} fillOpacity="0.35" />
    </svg>
  );
}
