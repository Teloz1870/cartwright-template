import type { CSSProperties } from "react";
/**
 * ButterflySwarm — five hand-drawn butterflies drifting in loose formation,
 * wings beating in offset rhythm along a dotted flight line.
 *
 * Hand-authored, hero-grade ANIMATED inline SVG (server component, no client
 * JS). Motion is pure CSS in a scoped <style> block: compositor-only
 * transform/opacity keyframes, namespaced (`cwsi-swarm-*`), every rule inside
 * `@media (prefers-reduced-motion: no-preference)` — reduced motion renders a
 * beautiful static swarm. All paint reads the cw-* palette tokens with the
 * engine fallback chain; gradient ids are stable and namespaced.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */
import type { ReactElement } from "react";

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** Where each butterfly rides: position, heading and size (lead bird largest). */
const SWARM: ReadonlyArray<{ x: number; y: number; rot: number; s: number }> = [
  { x: 42, y: 38, rot: -10, s: 1.05 },
  { x: 78, y: 26, rot: 16, s: 0.75 },
  { x: 94, y: 60, rot: -22, s: 0.55 },
  { x: 60, y: 78, rot: 8, s: 0.7 },
  { x: 24, y: 72, rot: -30, s: 0.5 },
];

/** Compositor-only motion, all under the reduced-motion gate. */
const SWARM_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-swarm-wing {
    transform-box: fill-box;
    transform-origin: 100% 50%;
    animation: cwsi-swarm-flap 8s ease-in-out infinite;
  }
  .cwsi-swarm-drift {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-swarm-drift 16s ease-in-out infinite;
  }
  .cwsi-swarm-b2 { animation-duration: 19s; animation-delay: -4s; }
  .cwsi-swarm-b3 { animation-duration: 13s; animation-delay: -7s; }
  .cwsi-swarm-b4 { animation-duration: 17s; animation-delay: -10s; }
  .cwsi-swarm-b5 { animation-duration: 14s; animation-delay: -2s; }
  .cwsi-swarm-b2 .cwsi-swarm-wing { animation-delay: -1.4s; }
  .cwsi-swarm-b3 .cwsi-swarm-wing { animation-delay: -3.1s; }
  .cwsi-swarm-b4 .cwsi-swarm-wing { animation-delay: -4.7s; }
  .cwsi-swarm-b5 .cwsi-swarm-wing { animation-delay: -6.2s; }
  .cwsi-swarm-mote {
    animation: cwsi-swarm-mote 12s ease-in-out infinite;
  }
  .cwsi-swarm-m2 { animation-delay: -4s; }
  .cwsi-swarm-m3 { animation-delay: -8s; }
  /* Two quick beats, then a long glide — like real flight. */
  @keyframes cwsi-swarm-flap {
    0%, 30%, 100% { transform: scaleX(1); }
    7% { transform: scaleX(0.45); }
    14% { transform: scaleX(0.95); }
    21% { transform: scaleX(0.5); }
    62% { transform: scaleX(0.88); }
  }
  @keyframes cwsi-swarm-drift {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    25% { transform: translate(2.6px, -3.4px) rotate(2deg); }
    50% { transform: translate(5px, 0.6px) rotate(-1.6deg); }
    75% { transform: translate(1.8px, 3px) rotate(1.2deg); }
  }
  @keyframes cwsi-swarm-mote {
    0%, 100% { opacity: 0.25; transform: translate(0, 0); }
    50% { opacity: 0.6; transform: translate(1.6px, -2.4px); }
  }
}
`;

/** One wing pair (left side, drawn at x < 0); right side is mirrored. */
function SwarmWing(): ReactElement {
  return (
    <g className="cwsi-swarm-wing">
      {/* Forewing */}
      <path
        d="M-1 -1.5 C -5 -8.5, -13 -12, -18.5 -9 C -22 -7, -21 -2, -15.5 -0.5 C -10.5 1, -4 0.8, -1 -1.5 Z"
        fill="url(#cwsi-swarm-fore)"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.5"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* Hindwing */}
      <path
        d="M-1 0.5 C -5.5 0.2, -10.5 2.5, -12.5 6.5 C -13.8 9.5, -11.5 12, -8 11 C -4.5 10, -1.5 6.5, -0.8 2.5 Z"
        fill="url(#cwsi-swarm-hind)"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.45"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* Veins */}
      <g stroke={INK} strokeOpacity="0.25" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M-3 -2 C -8 -5.5, -13 -7.5, -17 -8" />
        <path d="M-3 -1 C -8 -2.5, -13 -3, -17.5 -3.5" />
        <path d="M-2.5 1.5 C -6 3, -9 5.5, -10.5 8.5" />
      </g>
      {/* Eyespot */}
      <circle cx="-13.5" cy="-6.5" r="1.2" fill={CREAM} fillOpacity="0.85" />
      <circle cx="-13.5" cy="-6.5" r="0.5" fill={ACCENT_DEEP} fillOpacity="0.9" />
    </g>
  );
}

/** A whole butterfly in its local frame (body at the origin, head up). */
function SwarmButterfly(): ReactElement {
  return (
    <g>
      <SwarmWing />
      <g transform="scale(-1 1)">
        <SwarmWing />
      </g>
      {/* Antennae */}
      <g stroke={INK} strokeOpacity="0.8" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M-0.8 -3.5 C -2.5 -6.5, -4.5 -9, -7 -10.5" />
        <path d="M0.8 -3.5 C 2.5 -6.5, 4.5 -9, 7 -10.5" />
      </g>
      <circle cx="-7.2" cy="-10.7" r="0.6" fill={INK} fillOpacity="0.8" />
      <circle cx="7.2" cy="-10.7" r="0.6" fill={INK} fillOpacity="0.8" />
      {/* Body — head, thorax, tapering abdomen */}
      <circle cx="0" cy="-3.2" r="1.2" fill={INK} fillOpacity="0.9" />
      <ellipse cx="0" cy="0.4" rx="1.2" ry="3.2" fill={INK} fillOpacity="0.9" />
      <path d="M0 3 C 1.1 5.5, 1.1 8, 0 10.5 C -1.1 8, -1.1 5.5, 0 3 Z" fill={INK} fillOpacity="0.85" />
    </g>
  );
}

export function ButterflySwarm({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className} style={style}
    >
      <defs>
        <linearGradient id="cwsi-swarm-fore" x1="1" y1="0" x2="0" y2="0.7">
          <stop offset="0" stopColor={ACCENT} />
          <stop offset="0.55" stopColor={ACCENT} stopOpacity="0.85" />
          <stop offset="1" stopColor={ACCENT_DEEP} />
        </linearGradient>
        <linearGradient id="cwsi-swarm-hind" x1="1" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={ACCENT_DEEP} />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: SWARM_CSS }} />

      {/* The flight line the swarm follows — a dotted thermals trace */}
      <path
        d="M14 98 C 30 80, 26 58, 42 44 C 56 32, 70 34, 78 26 M82 44 C 88 50, 92 56, 94 62"
        fill="none"
        stroke={INK}
        strokeOpacity="0.12"
        strokeWidth="0.75"
        strokeDasharray="1 4"
        strokeLinecap="round"
      />

      {/* The swarm — each rider gets its own drift phase + wing tempo */}
      {SWARM.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.rot}) scale(${b.s})`}>
          <g className={`cwsi-swarm-drift cwsi-swarm-b${i + 1}`}>
            <SwarmButterfly />
          </g>
        </g>
      ))}

      {/* Pollen motes stirred up by the wingbeats */}
      <circle className="cwsi-swarm-mote" cx="34" cy="22" r="0.8" fill={OKER} fillOpacity="0.5" />
      <circle className="cwsi-swarm-mote cwsi-swarm-m2" cx="98" cy="36" r="0.7" fill={ACCENT} fillOpacity="0.45" />
      <circle className="cwsi-swarm-mote cwsi-swarm-m3" cx="76" cy="94" r="0.7" fill={OKER} fillOpacity="0.4" />
      <circle cx="14" cy="44" r="0.6" fill={MUTED} fillOpacity="0.4" />
      <circle cx="108" cy="80" r="0.6" fill={MUTED} fillOpacity="0.35" />
    </svg>
  );
}
