/**
 * MountainIllustration — receding ridgelines under a warm sun, with mist
 * pooled in the valley and a treed foothill in front.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * Atmospheric depth is real: each ridge fades toward its base via its own
 * namespaced gradient (`cwsi-mtn-*`), so farther ranges dissolve into the
 * page. All paint reads the cw-* palette tokens with the engine fallback
 * chain — the scene renders in whichever palette the shop runs.
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

export function MountainIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <radialGradient id="cwsi-mtn-sun" cx="0.4" cy="0.36" r="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.55" stopColor={OKER} />
          <stop offset="1" stopColor={OKER_DEEP} />
        </radialGradient>
        <linearGradient id="cwsi-mtn-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MUTED} stopOpacity="0.4" />
          <stop offset="1" stopColor={MUTED} stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="cwsi-mtn-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0.45" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="cwsi-mtn-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACCENT_DEEP} stopOpacity="0.8" />
          <stop offset="1" stopColor={ACCENT_DEEP} stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="cwsi-mtn-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CREAM} stopOpacity="0" />
          <stop offset="0.5" stopColor={CREAM} stopOpacity="0.55" />
          <stop offset="1" stopColor={CREAM} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cwsi-mtn-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SAND} stopOpacity="0.7" />
          <stop offset="1" stopColor={SAND} stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Sun — layered halo, gradient disc, two passing clouds */}
      <circle cx="84" cy="30" r="18" fill={OKER} fillOpacity="0.07" />
      <circle cx="84" cy="30" r="13.5" fill={OKER} fillOpacity="0.1" />
      <circle cx="84" cy="30" r="9.5" fill="url(#cwsi-mtn-sun)" />
      <circle cx="84" cy="30" r="11.5" fill="none" stroke={OKER} strokeOpacity="0.3" strokeWidth="0.75" />
      <g stroke={MUTED} strokeOpacity="0.3" strokeLinecap="round" fill="none">
        <path d="M70 26.5 L91 26.5" strokeWidth="2" />
        <path d="M78 35 L97 35" strokeWidth="1.5" />
      </g>

      {/* Birds — two strokes of wing against the light */}
      <g stroke={INK} strokeOpacity="0.5" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M38 24 Q 40 21.8 42 24 Q 44 21.8 46 24" />
        <path d="M52 32 Q 53.5 30.4 55 32 Q 56.5 30.4 58 32" />
      </g>

      {/* Far ridge — almost dissolved in haze */}
      <path
        d="M4 66 L17 53 L28 60.5 L43 48 L56 57.5 L70 50.5 L82 56.5 L97 48.5 L116 62 L116 84 L4 84 Z"
        fill="url(#cwsi-mtn-far)"
      />
      <path
        d="M4 66 L17 53 L28 60.5 L43 48 L56 57.5 L70 50.5 L82 56.5 L97 48.5 L116 62"
        fill="none"
        stroke={MUTED}
        strokeOpacity="0.35"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />

      {/* Valley mist pooling in front of the far ridge */}
      <rect x="4" y="58" width="112" height="14" fill="url(#cwsi-mtn-mist)" />

      {/* Mid ridge */}
      <path
        d="M4 82 L20 62 L31 71 L48 54 L62 67 L76 58 L92 70 L104 63 L116 74 L116 96 L4 96 Z"
        fill="url(#cwsi-mtn-mid)"
      />
      <path
        d="M4 82 L20 62 L31 71 L48 54 L62 67 L76 58 L92 70 L104 63 L116 74"
        fill="none"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.4"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* Faint spurs running down the mid faces */}
      <g stroke={ACCENT_DEEP} strokeOpacity="0.2" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M48 54 L44 66" />
        <path d="M76 58 L73 68" />
      </g>

      {/* Near ridge — the protagonist, snow on its shoulders */}
      <path
        d="M4 98 L28 64 L40 79 L60 54 L76 73 L90 60 L116 92 L116 108 L4 108 Z"
        fill="url(#cwsi-mtn-near)"
      />
      <path
        d="M4 98 L28 64 L40 79 L60 54 L76 73 L90 60 L116 92"
        fill="none"
        stroke={INK}
        strokeOpacity="0.5"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Snowcaps — broken zigzags hugging the two main summits */}
      <g stroke={CREAM} strokeOpacity="0.85" strokeWidth="1.25" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M56 59 L60 54 L64 59 L62 58 L60 60.5 L58 58 Z" />
        <path d="M25 68 L28 64 L31 67.8" />
        <path d="M87.5 63 L90 60 L93 63.7" />
      </g>
      <g stroke={CREAM} strokeOpacity="0.5" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M59 62.5 L60 64.5" />
        <path d="M28.5 70 L29.5 72.5" />
      </g>
      {/* Shadow facets on the near faces */}
      <g stroke={INK} strokeOpacity="0.25" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M60 54 L57 72 L55 84" />
        <path d="M28 64 L26 78" />
        <path d="M90 60 L92 76 L95 86" />
      </g>

      {/* Foothill with a path and three small pines */}
      <path d="M4 104 C 40 97.5, 80 97.5, 116 103 L116 112 L4 112 Z" fill="url(#cwsi-mtn-hill)" />
      <path
        d="M4 104 C 40 97.5, 80 97.5, 116 103"
        fill="none"
        stroke={MUTED}
        strokeOpacity="0.4"
        strokeWidth="0.75"
      />
      <g fill={INK} fillOpacity="0.55">
        <path d="M30 102.5 L32.2 97.5 L34.4 102.5 Z" />
        <path d="M38 103 L39.8 99 L41.6 103 Z" />
        <path d="M88 102 L90 97.6 L92 102 Z" />
      </g>
      <g stroke={INK} strokeOpacity="0.5" strokeWidth="0.75" strokeLinecap="round">
        <path d="M32.2 102.5 L32.2 104" />
        <path d="M39.8 103 L39.8 104.2" />
        <path d="M90 102 L90 103.6" />
      </g>
      {/* The trail wandering toward the ridge */}
      <path
        d="M58 110 C 56 107, 57.5 104.5, 60 102.5 C 62.5 100.8, 63 99.5, 62 98.5"
        fill="none"
        stroke={MUTED}
        strokeOpacity="0.5"
        strokeWidth="0.75"
        strokeDasharray="2 2"
        strokeLinecap="round"
      />
    </svg>
  );
}
