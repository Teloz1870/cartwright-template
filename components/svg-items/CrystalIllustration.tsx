import type { CSSProperties } from "react";
/**
 * CrystalIllustration — a faceted crystal cluster growing from rock, lit by
 * an inner glow.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * Each crystal is built from individual facet polygons — a lit face and a
 * shaded face per shard — with fine internal facet lines and cream edge
 * light. All paint reads the cw-* palette tokens with the engine fallback
 * chain; gradient ids are stable and namespaced (`cwsi-crystal-*`).
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const SAND = "var(--color-cw-sand, var(--color-cw-stone-100, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

export function CrystalIllustration({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className} style={style}
    >
      <defs>
        <linearGradient id="cwsi-crystal-lit" x1="0" y1="0" x2="0.45" y2="1">
          <stop offset="0" stopColor={CREAM} stopOpacity="0.95" />
          <stop offset="0.5" stopColor={SAND} stopOpacity="0.8" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="cwsi-crystal-shade" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0.6" />
          <stop offset="1" stopColor={ACCENT_DEEP} stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id="cwsi-crystal-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Inner glow breathing behind the cluster */}
      <circle cx="58" cy="66" r="40" fill="url(#cwsi-crystal-glow)" />
      {/* Ground shadow */}
      <ellipse cx="60" cy="103" rx="28" ry="3.5" fill={INK} fillOpacity="0.1" />

      {/* Left shard — leaning out, tip at (29,44) */}
      <path d="M29 44 L19 72 L27 97 L33 95 Z" fill="url(#cwsi-crystal-lit)" />
      <path d="M29 44 L38 66 L41 94 L33 95 Z" fill="url(#cwsi-crystal-shade)" />
      <path
        d="M29 44 L19 72 L27 97 L41 94 L38 66 Z"
        fill="none"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.55"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path d="M29 44 L33 95" stroke={CREAM} strokeOpacity="0.5" strokeWidth="0.75" />
      <path d="M29 44 L25 70 L27 92" stroke={INK} strokeOpacity="0.18" strokeWidth="0.75" fill="none" />

      {/* Right shard — smaller, leaning right, tip at (92,52) */}
      <path d="M92 52 L82 70 L85 96 L92 95 Z" fill="url(#cwsi-crystal-lit)" />
      <path d="M92 52 L100 72 L99 93 L92 95 Z" fill="url(#cwsi-crystal-shade)" />
      <path
        d="M92 52 L82 70 L85 96 L99 93 L100 72 Z"
        fill="none"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.55"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path d="M92 52 L92 95" stroke={CREAM} strokeOpacity="0.45" strokeWidth="0.75" />
      <path d="M92 52 L96 74 L96 90" stroke={INK} strokeOpacity="0.15" strokeWidth="0.75" fill="none" />

      {/* Main crystal — the tall column, tip at (58,16) */}
      <path d="M58 16 L47 40 L49 92 L58 98 Z" fill="url(#cwsi-crystal-lit)" />
      <path d="M58 16 L69 38 L67 90 L58 98 Z" fill="url(#cwsi-crystal-shade)" />
      <path
        d="M58 16 L47 40 L49 92 L58 98 L67 90 L69 38 Z"
        fill="none"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.6"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Light edge down the central arris */}
      <path d="M58 16 L58 98" stroke={CREAM} strokeOpacity="0.65" strokeWidth="1" strokeLinecap="round" />
      {/* Internal facet lines */}
      <g stroke={INK} strokeOpacity="0.2" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M58 16 L53 42 L52 88" />
        <path d="M58 16 L63 40 L62.5 88" />
        <path d="M47 40 L53 42 L58 38 L63 40 L69 38" />
      </g>
      {/* Core light caught inside the column */}
      <ellipse cx="57.5" cy="62" rx="4.5" ry="15" fill={CREAM} fillOpacity="0.2" />
      <ellipse cx="57.5" cy="60" rx="2" ry="9" fill={CREAM} fillOpacity="0.35" />

      {/* Front nub — a young crystal starting out, drawn over the others */}
      <path d="M74 76 L69 88 L71 99 L75 98 Z" fill="url(#cwsi-crystal-lit)" />
      <path d="M74 76 L80 88 L81 97 L75 98 Z" fill="url(#cwsi-crystal-shade)" />
      <path
        d="M74 76 L69 88 L71 99 L81 97 L80 88 Z"
        fill="none"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.55"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path d="M74 76 L75 98" stroke={CREAM} strokeOpacity="0.5" strokeWidth="0.75" />

      {/* Base rocks anchoring the cluster */}
      <g stroke={INK} strokeOpacity="0.3" strokeWidth="0.75" strokeLinejoin="round">
        <path d="M36 103 L42 96.5 L52 98 L54 103 Z" fill={MUTED} fillOpacity="0.4" />
        <path d="M82 102.5 L88 97 L96 99 L97 102.5 Z" fill={MUTED} fillOpacity="0.35" />
        <path d="M55 104 L61 100 L70 101 L72 104 Z" fill={MUTED} fillOpacity="0.5" />
      </g>

      {/* Glints — four-point flares where the light snags an edge */}
      <path
        d="M54 33 L54.9 35.7 L57.6 36.6 L54.9 37.5 L54 40.2 L53.1 37.5 L50.4 36.6 L53.1 35.7 Z"
        fill={CREAM}
        fillOpacity="0.9"
      />
      <path
        d="M88 60 L88.7 62 L90.7 62.7 L88.7 63.4 L88 65.4 L87.3 63.4 L85.3 62.7 L87.3 62 Z"
        fill={CREAM}
        fillOpacity="0.85"
      />
      <path
        d="M33 56 L33.6 57.7 L35.3 58.3 L33.6 58.9 L33 60.6 L32.4 58.9 L30.7 58.3 L32.4 57.7 Z"
        fill={CREAM}
        fillOpacity="0.8"
      />
      <circle cx="63" cy="50" r="0.8" fill={CREAM} fillOpacity="0.7" />

      {/* Motes rising in the glow */}
      <circle cx="44" cy="34" r="0.8" fill={OKER} fillOpacity="0.55" />
      <circle cx="76" cy="40" r="0.7" fill={ACCENT} fillOpacity="0.5" />
      <circle cx="104" cy="62" r="0.6" fill={OKER} fillOpacity="0.45" />
      <circle cx="16" cy="58" r="0.6" fill={ACCENT} fillOpacity="0.4" />
      <circle cx="68" cy="24" r="0.6" fill={OKER} fillOpacity="0.4" />
      <circle cx="98" cy="42" r="0.5" fill={MUTED} fillOpacity="0.5" />
    </svg>
  );
}
