/**
 * CometMark — a comet head with a layered, particle-strewn tail arc.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * The tail is three nested tapering strands that fade along their length via
 * namespaced gradients (`cwsi-comet-*`); loose particles trail the arc. All
 * paint reads the cw-* palette tokens with the engine fallback chain.
 *
 * Opt-in hover motion: render inside an element carrying the `cwsi-animate`
 * class and the comet wakes on hover (head glow pulses, dust drifts tailward,
 * strands shimmer). Without that class — or under reduced motion — nothing
 * ever moves.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

/** Hover-only motion, gated on both `.cwsi-animate` and reduced-motion. */
const COMET_HOVER_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-animate:hover .cwsi-comet-hov-glow {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-comet-hovpulse 3.6s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-comet-hov-dust {
    animation: cwsi-comet-hovdrift 4.8s linear infinite;
  }
  .cwsi-animate:hover .cwsi-comet-hov-dust2 { animation-delay: -1.6s; }
  .cwsi-animate:hover .cwsi-comet-hov-dust3 { animation-delay: -3.2s; }
  .cwsi-animate:hover .cwsi-comet-hov-tail {
    animation: cwsi-comet-hovshimmer 4.8s ease-in-out infinite;
  }
  @keyframes cwsi-comet-hovpulse {
    0%, 100% { transform: scale(1); opacity: 0.85; }
    50% { transform: scale(1.12); opacity: 1; }
  }
  @keyframes cwsi-comet-hovdrift {
    0% { transform: translate(-4px, 4px); opacity: 0; }
    25% { opacity: 1; }
    100% { transform: translate(7px, -7px); opacity: 0; }
  }
  @keyframes cwsi-comet-hovshimmer {
    0%, 100% { opacity: 0.85; }
    50% { opacity: 1; }
  }
}
`;

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** Trailing dust — hand-placed along the tail arc, thinning toward the tip. */
const PARTICLES: ReadonlyArray<{ x: number; y: number; r: number; c: string; o: number }> = [
  { x: 47, y: 68, r: 1.4, c: ACCENT, o: 0.6 },
  { x: 54, y: 74, r: 1.1, c: OKER, o: 0.55 },
  { x: 60, y: 62, r: 1.2, c: ACCENT_DEEP, o: 0.5 },
  { x: 66, y: 70, r: 0.9, c: MUTED, o: 0.5 },
  { x: 72, y: 52, r: 1.1, c: ACCENT, o: 0.45 },
  { x: 79, y: 60, r: 0.8, c: OKER, o: 0.45 },
  { x: 84, y: 42, r: 0.9, c: ACCENT_DEEP, o: 0.4 },
  { x: 90, y: 50, r: 0.7, c: MUTED, o: 0.4 },
  { x: 95, y: 33, r: 0.8, c: ACCENT, o: 0.35 },
  { x: 101, y: 40, r: 0.6, c: OKER, o: 0.3 },
  { x: 105, y: 25, r: 0.6, c: ACCENT_DEEP, o: 0.28 },
  { x: 111, y: 31, r: 0.5, c: MUTED, o: 0.25 },
];

export function CometMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        {/* Tail gradients run head (lower-left) → tip (upper-right) and fade out */}
        <linearGradient id="cwsi-comet-outer" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0.35" />
          <stop offset="0.6" stopColor={ACCENT} stopOpacity="0.15" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cwsi-comet-mid" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={ACCENT_DEEP} stopOpacity="0.55" />
          <stop offset="0.65" stopColor={ACCENT_DEEP} stopOpacity="0.2" />
          <stop offset="1" stopColor={ACCENT_DEEP} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cwsi-comet-core" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={OKER} stopOpacity="0.85" />
          <stop offset="0.7" stopColor={OKER} stopOpacity="0.3" />
          <stop offset="1" stopColor={OKER} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="cwsi-comet-coma" cx="0.4" cy="0.4" r="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.55" stopColor={ACCENT} />
          <stop offset="1" stopColor={ACCENT_DEEP} />
        </radialGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: COMET_HOVER_CSS }} />

      {/* Trajectory echo — the path it has already travelled */}
      <path
        d="M10 50 C 16 66, 22 76, 34 84"
        fill="none"
        stroke={INK}
        strokeOpacity="0.1"
        strokeWidth="0.75"
        strokeDasharray="1 4"
        strokeLinecap="round"
      />

      {/* Tail — widest, softest strand first; each layer rides the same arc */}
      <path
        className="cwsi-comet-hov-tail"
        d="M35 81 C 56 69, 81 44, 108 17"
        fill="none"
        stroke="url(#cwsi-comet-outer)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        className="cwsi-comet-hov-tail"
        d="M35 81 C 57 70, 83 47, 106 20"
        fill="none"
        stroke="url(#cwsi-comet-mid)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        className="cwsi-comet-hov-tail"
        d="M35 81 C 55 70, 79 45, 102 22"
        fill="none"
        stroke="url(#cwsi-comet-core)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* A stray fourth strand peeling off below the main tail */}
      <path
        className="cwsi-comet-hov-tail"
        d="M37 84 C 61 76, 89 56, 110 32"
        fill="none"
        stroke="url(#cwsi-comet-mid)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Trailing dust */}
      {PARTICLES.map((p, i) => (
        <circle
          key={i}
          className={`cwsi-comet-hov-dust${i % 3 === 1 ? " cwsi-comet-hov-dust2" : i % 3 === 2 ? " cwsi-comet-hov-dust3" : ""}`}
          cx={p.x}
          cy={p.y}
          r={p.r}
          fill={p.c}
          fillOpacity={p.o}
        />
      ))}

      {/* Head — glow, coma, nucleus, glint */}
      <circle className="cwsi-comet-hov-glow" cx="34" cy="82" r="11" fill={ACCENT} fillOpacity="0.12" />
      <circle className="cwsi-comet-hov-glow" cx="34" cy="82" r="7.5" fill={ACCENT} fillOpacity="0.14" />
      <circle
        cx="34"
        cy="82"
        r="5.6"
        fill="url(#cwsi-comet-coma)"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.5"
        strokeWidth="0.75"
      />
      <circle cx="32.6" cy="80.4" r="1.9" fill={CREAM} fillOpacity="0.9" />
      <circle cx="31.9" cy="79.7" r="0.7" fill={CREAM} />
      {/* Shock-front whiskers ahead of the head */}
      <g stroke={ACCENT_DEEP} strokeOpacity="0.4" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M26.5 76 C 23.5 78, 22 81, 22 84.5" />
        <path d="M28 89 C 25.5 90.5, 24 92.5, 23.5 95" />
      </g>

      {/* Night field — faint stars keeping the comet company */}
      <g stroke={INK} strokeOpacity="0.4" strokeWidth="0.75" strokeLinecap="round">
        <path d="M88 84 L88 88 M86 86 L90 86" />
        <path d="M18 26 L18 29.6 M16.2 27.8 L19.8 27.8" />
      </g>
      <circle cx="58" cy="24" r="0.8" fill={MUTED} fillOpacity="0.5" />
      <circle cx="42" cy="38" r="0.6" fill={INK} fillOpacity="0.3" />
      <circle cx="74" cy="92" r="0.7" fill={MUTED} fillOpacity="0.45" />
      <circle cx="104" cy="66" r="0.7" fill={INK} fillOpacity="0.35" />
      <circle cx="64" cy="106" r="0.6" fill={INK} fillOpacity="0.3" />
      <circle cx="14" cy="64" r="0.6" fill={MUTED} fillOpacity="0.4" />
    </svg>
  );
}
