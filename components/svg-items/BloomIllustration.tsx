/**
 * BloomIllustration — an opening flower with three layered petal rings, a
 * stamen crown, stem and leaves, plus one petal caught mid-fall.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * One petal per ring is hand-drawn, then turned around the flower's heart so
 * every ring keeps a single believable shape. All paint reads the cw-*
 * palette tokens with the engine fallback chain; gradient ids are stable and
 * namespaced (`cwsi-bloom-*`).
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
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** Outer-ring petal angles (uneven on purpose — open flowers aren't clocks). */
const OUTER_ANGLES = [0, 58, 122, 180, 238, 302] as const;
/** Mid-ring petals sit in the outer ring's gaps. */
const MID_ANGLES = [30, 100, 152, 210, 270, 330] as const;
/** Innermost petals, still half-cupped around the heart. */
const INNER_ANGLES = [12, 132, 252] as const;

export function BloomIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="cwsi-bloom-petal" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={ACCENT_DEEP} />
          <stop offset="0.45" stopColor={ACCENT} />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="cwsi-bloom-mid" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={ACCENT} />
          <stop offset="1" stopColor={CREAM} stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="cwsi-bloom-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={OKER} stopOpacity="0.5" />
          <stop offset="1" stopColor={OKER_DEEP} stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="60" cy="112.5" rx="15" ry="2.2" fill={INK} fillOpacity="0.08" />

      {/* Stem — a slow S holding the head */}
      <path
        d="M60 112 C 57.5 98, 59 84, 60 64"
        fill="none"
        stroke={INK}
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Left leaf with vein, right leaf answering higher up */}
      <path
        d="M59 96 C 50.5 93.5, 43.5 87, 42 78.5 C 51 80.5, 57.5 87.5, 59 96 Z"
        fill="url(#cwsi-bloom-leaf)"
        stroke={OKER_DEEP}
        strokeOpacity="0.5"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path
        d="M57.5 93.5 C 53 90.5, 48.5 86.5, 45.5 82"
        fill="none"
        stroke={OKER_DEEP}
        strokeOpacity="0.45"
        strokeWidth="0.75"
        strokeLinecap="round"
      />
      <path
        d="M60.5 86 C 68.5 84.5, 75.5 79, 77.5 71 C 68.5 72.5, 62 79, 60.5 86 Z"
        fill="url(#cwsi-bloom-leaf)"
        stroke={OKER_DEEP}
        strokeOpacity="0.5"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path
        d="M62.5 83.5 C 67 80.5, 71.5 76.5, 74.5 72.5"
        fill="none"
        stroke={OKER_DEEP}
        strokeOpacity="0.45"
        strokeWidth="0.75"
        strokeLinecap="round"
      />

      {/* Sepals peeking out beneath the head */}
      <g fill={MUTED} fillOpacity="0.45">
        <path d="M60 64 C 56 62, 53 58.5, 52.5 54.5 C 56.5 56.5, 59.5 60, 60 64 Z" />
        <path d="M60 64 C 64 62, 67 58.5, 67.5 54.5 C 63.5 56.5, 60.5 60, 60 64 Z" />
      </g>

      {/* ── The head, centred on (60,42) ───────────────────────────────── */}

      {/* Outer ring — fully open petals */}
      {OUTER_ANGLES.map((a) => (
        <g key={a} transform={`rotate(${a} 60 42)`}>
          <path
            d="M60 44.5 C 52.5 38.5, 51.5 26.5, 60 18.5 C 68.5 26.5, 67.5 38.5, 60 44.5 Z"
            fill="url(#cwsi-bloom-petal)"
            fillOpacity="0.85"
            stroke={ACCENT_DEEP}
            strokeOpacity="0.5"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
          <path
            d="M60 42 C 59 35.5, 59 28.5, 60 22.5"
            fill="none"
            stroke={CREAM}
            strokeOpacity="0.4"
            strokeWidth="0.75"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* Mid ring — lighter, lifted into the gaps */}
      {MID_ANGLES.map((a) => (
        <g key={a} transform={`rotate(${a} 60 42)`}>
          <path
            d="M60 44 C 55 39.5, 54.5 31, 60 25.5 C 65.5 31, 65 39.5, 60 44 Z"
            fill="url(#cwsi-bloom-mid)"
            fillOpacity="0.9"
            stroke={ACCENT_DEEP}
            strokeOpacity="0.35"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
        </g>
      ))}

      {/* Inner ring — still cupped, nearly closed over the heart */}
      {INNER_ANGLES.map((a) => (
        <g key={a} transform={`rotate(${a} 60 42)`}>
          <path
            d="M60 43.5 C 56.8 40.5, 56.5 35, 60 31.5 C 63.5 35, 63.2 40.5, 60 43.5 Z"
            fill={CREAM}
            fillOpacity="0.9"
            stroke={ACCENT}
            strokeOpacity="0.5"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
        </g>
      ))}

      {/* Stamen crown — eight anthers on fine filaments around the disc */}
      <g stroke={OKER} strokeOpacity="0.7" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M60 42 C 58 39.5, 56.5 37.5, 55 36" />
        <path d="M60 42 C 61.8 39.3, 63.2 37.5, 65 36" />
        <path d="M60 42 C 57 41, 54.5 40, 52.8 38.8" />
        <path d="M60 42 C 63 41, 65.5 40, 67.2 38.8" />
        <path d="M60 42 C 58.2 44.2, 56.5 45.8, 54.6 46.8" />
        <path d="M60 42 C 61.8 44.2, 63.5 45.8, 65.4 46.8" />
        <path d="M60 42 C 59.5 39, 59.3 36.8, 59.5 34.8" />
        <path d="M60 42 C 60.5 45, 60.6 47, 60.4 49" />
      </g>
      <g fill={OKER_DEEP}>
        <circle cx="55" cy="36" r="1" fillOpacity="0.9" />
        <circle cx="65" cy="36" r="1" fillOpacity="0.9" />
        <circle cx="52.8" cy="38.8" r="0.9" fillOpacity="0.85" />
        <circle cx="67.2" cy="38.8" r="0.9" fillOpacity="0.85" />
        <circle cx="54.6" cy="46.8" r="0.9" fillOpacity="0.8" />
        <circle cx="65.4" cy="46.8" r="0.9" fillOpacity="0.8" />
        <circle cx="59.5" cy="34.8" r="0.8" fillOpacity="0.85" />
        <circle cx="60.4" cy="49" r="0.8" fillOpacity="0.8" />
      </g>
      {/* The disc itself */}
      <circle cx="60" cy="42" r="3.2" fill={OKER} stroke={OKER_DEEP} strokeOpacity="0.6" strokeWidth="0.75" />
      <circle cx="59" cy="41" r="1" fill={CREAM} fillOpacity="0.85" />

      {/* Dew drop resting on an outer petal */}
      <circle cx="46.5" cy="50.5" r="1.5" fill={CREAM} fillOpacity="0.85" stroke={ACCENT_DEEP} strokeOpacity="0.3" strokeWidth="0.5" />
      <circle cx="46" cy="50" r="0.5" fill={CREAM} />

      {/* One petal let go — falling to the right, already fading */}
      <g transform="rotate(40 88 78)" opacity="0.6">
        <path
          d="M88 84 C 84 80.5, 83.5 73.5, 88 69 C 92.5 73.5, 92 80.5, 88 84 Z"
          fill="url(#cwsi-bloom-petal)"
          stroke={ACCENT_DEEP}
          strokeOpacity="0.4"
          strokeWidth="0.75"
        />
      </g>
      {/* Pollen drifting on the air */}
      <circle cx="82" cy="30" r="0.8" fill={OKER} fillOpacity="0.5" />
      <circle cx="36" cy="34" r="0.6" fill={OKER} fillOpacity="0.4" />
      <circle cx="90" cy="52" r="0.6" fill={ACCENT} fillOpacity="0.4" />
      <circle cx="30" cy="58" r="0.5" fill={ACCENT} fillOpacity="0.35" />
    </svg>
  );
}
