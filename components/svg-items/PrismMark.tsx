/**
 * PrismMark — a glass prism refracting one beam into a tonal spectrum fan.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * All paint reads the cw-* palette tokens with the engine fallback chain, so
 * the spectrum renders in the shop's own hues — no hex values live here.
 * Gradient ids are stable and namespaced (`cwsi-prism-*`).
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const OKER_DEEP =
  "var(--color-cw-gold-deep, var(--color-cw-oker-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const SAND = "var(--color-cw-sand, var(--color-cw-stone-100, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** Spectrum bands — each fans out from the exit face and fades to the right. */
const BANDS: ReadonlyArray<{ id: string; d: string; color: string; peak: number }> = [
  { id: "cwsi-prism-b1", d: "M64 50.5 L114 25 L114 33 L64 54 Z", color: OKER, peak: 0.6 },
  { id: "cwsi-prism-b2", d: "M64 54 L114 35 L114 44 L64 57 Z", color: ACCENT, peak: 0.65 },
  { id: "cwsi-prism-b3", d: "M64 57 L114 46 L114 56 L64 60 Z", color: ACCENT_DEEP, peak: 0.7 },
  { id: "cwsi-prism-b4", d: "M64 60 L114 58 L114 68 L64 63 Z", color: OKER_DEEP, peak: 0.55 },
  { id: "cwsi-prism-b5", d: "M64 63 L114 70 L114 79 L64 66 Z", color: MUTED, peak: 0.45 },
];

export function PrismMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        {BANDS.map((b) => (
          <linearGradient key={b.id} id={b.id} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={b.color} stopOpacity={b.peak} />
            <stop offset="0.75" stopColor={b.color} stopOpacity={b.peak * 0.35} />
            <stop offset="1" stopColor={b.color} stopOpacity="0.04" />
          </linearGradient>
        ))}
        <linearGradient id="cwsi-prism-glass" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={CREAM} stopOpacity="0.5" />
          <stop offset="0.55" stopColor={SAND} stopOpacity="0.35" />
          <stop offset="1" stopColor={SAND} stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="52" cy="89" rx="26" ry="2.6" fill={INK} fillOpacity="0.08" />

      {/* Incoming beam — soft warm under-glow with a fine dark core */}
      <path
        d="M6 64.5 L40 57.5"
        stroke={OKER}
        strokeOpacity="0.18"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M6 64.5 L40 57.5"
        stroke={INK}
        strokeOpacity="0.55"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Entry shimmer ticks trailing the beam */}
      <g stroke={OKER} strokeOpacity="0.4" strokeWidth="0.75" strokeLinecap="round">
        <path d="M12 60 L17 59" />
        <path d="M20 68 L25 67" />
      </g>

      {/* Spectrum fan — drawn behind the prism so the exit face overlaps it */}
      {BANDS.map((b) => (
        <path key={b.id} d={b.d} fill={`url(#${b.id})`} />
      ))}
      {/* Hairline seams between bands */}
      <g stroke={CREAM} strokeOpacity="0.3" strokeWidth="0.75">
        <path d="M64 54 L108 36.5" />
        <path d="M64 57 L108 48" />
        <path d="M64 60 L108 58.8" />
        <path d="M64 63 L108 69.2" />
      </g>

      {/* Prism body — glass gradient over a crisp ink outline */}
      <path
        d="M52 28 L76 86 L28 86 Z"
        fill="url(#cwsi-prism-glass)"
        stroke={INK}
        strokeOpacity="0.7"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* Beam travelling inside the glass, widening toward the exit face */}
      <path d="M40 57.5 L64 51.5 L64 65 Z" fill={CREAM} fillOpacity="0.4" />
      <path d="M40 57.5 L64 51.5" stroke={CREAM} strokeOpacity="0.5" strokeWidth="0.75" />
      {/* Internal facet + sheen lines */}
      <path d="M52 28 L52 86" stroke={INK} strokeOpacity="0.12" strokeWidth="0.75" />
      <path
        d="M49 36 L33 76"
        stroke={CREAM}
        strokeOpacity="0.55"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M55.5 38 L70 74"
        stroke={CREAM}
        strokeOpacity="0.25"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Base reflection inside the glass */}
      <path d="M34 82.5 L70 82.5" stroke={INK} strokeOpacity="0.15" strokeWidth="0.75" />

      {/* Vertex jewels */}
      <circle cx="52" cy="28" r="1.4" fill={ACCENT_DEEP} fillOpacity="0.85" />
      <circle cx="28" cy="86" r="1.1" fill={MUTED} fillOpacity="0.7" />
      <circle cx="76" cy="86" r="1.1" fill={MUTED} fillOpacity="0.7" />

      {/* Refraction sparkle at the entry point */}
      <g stroke={OKER_DEEP} strokeOpacity="0.7" strokeWidth="0.75" strokeLinecap="round">
        <path d="M40 51.5 L40 55" />
        <path d="M36.5 54.5 L43 53.5" />
      </g>
      <circle cx="40" cy="57.5" r="1.2" fill={OKER} fillOpacity="0.9" />
      <circle cx="39.5" cy="57" r="0.5" fill={CREAM} fillOpacity="0.9" />

      {/* Drift motes riding the spectrum */}
      <circle cx="86" cy="34" r="0.9" fill={OKER} fillOpacity="0.5" />
      <circle cx="96" cy="49" r="0.7" fill={ACCENT} fillOpacity="0.45" />
      <circle cx="90" cy="64.5" r="0.8" fill={ACCENT_DEEP} fillOpacity="0.4" />
      <circle cx="100" cy="73" r="0.6" fill={MUTED} fillOpacity="0.45" />
      {/* Quiet dust under the beam */}
      <circle cx="16" cy="72" r="0.6" fill={INK} fillOpacity="0.25" />
      <circle cx="26" cy="50" r="0.6" fill={INK} fillOpacity="0.2" />
    </svg>
  );
}
