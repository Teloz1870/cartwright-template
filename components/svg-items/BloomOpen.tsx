import type { CSSProperties } from "react";
/**
 * BloomOpen — a flower whose petal rings unfold from the heart outward, then
 * sway gently on the stem while one loosed petal drifts down.
 *
 * Hand-authored, hero-grade ANIMATED inline SVG (server component, no client
 * JS). Motion is pure CSS in a scoped <style> block: compositor-only
 * transform/opacity keyframes, namespaced (`cwsi-bloomopen-*`), every rule
 * inside `@media (prefers-reduced-motion: no-preference)` — reduced motion
 * renders the bloom fully open. Petals pivot at their base (fill-box origin
 * 50% 100% = the flower's heart). All paint reads the cw-* palette tokens
 * with the engine fallback chain.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const OKER_DEEP = "var(--color-cw-gold-deep, var(--color-cw-oker-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** Outer-ring petal angles (uneven on purpose — open flowers aren't clocks). */
const OUTER_ANGLES = [0, 58, 122, 180, 238, 302] as const;
/** Mid-ring petals sit in the outer ring's gaps. */
const MID_ANGLES = [30, 100, 152, 210, 270, 330] as const;
/** Innermost petals, still half-cupped around the heart. */
const INNER_ANGLES = [12, 132, 252] as const;

/**
 * Compositor-only motion, all under the reduced-motion gate. Rings unfold in
 * order (outer → mid → inner), the crown blooms last, then the whole head
 * settles into a slow 12s sway. The springy bezier overshoots scale slightly
 * for a believable petal snap.
 */
const BLOOMOPEN_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-bloomopen-pet {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: cwsi-bloomopen-unfold 2.4s cubic-bezier(0.2, 0.9, 0.25, 1.18) both;
    animation-delay: 0.15s;
  }
  .cwsi-bloomopen-r2 { animation-delay: 0.65s; }
  .cwsi-bloomopen-r3 { animation-delay: 1.15s; }
  .cwsi-bloomopen-crown {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-bloomopen-crown 1.8s ease-out both;
    animation-delay: 1.9s;
  }
  .cwsi-bloomopen-sway {
    transform-box: fill-box;
    transform-origin: 50% 88%;
    animation: cwsi-bloomopen-sway 12s ease-in-out infinite;
    animation-delay: 3.4s;
  }
  .cwsi-bloomopen-fall {
    animation: cwsi-bloomopen-fall 16s ease-in-out infinite;
  }
  .cwsi-bloomopen-pollen {
    animation: cwsi-bloomopen-pollen 13s ease-in-out infinite;
  }
  .cwsi-bloomopen-pollen2 { animation-delay: -6.5s; }
  @keyframes cwsi-bloomopen-unfold {
    0% { transform: rotate(-16deg) scale(0.1); opacity: 0; }
    45% { opacity: 1; }
    100% { transform: rotate(0deg) scale(1); opacity: 1; }
  }
  @keyframes cwsi-bloomopen-crown {
    0% { transform: scale(0.3); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes cwsi-bloomopen-sway {
    0%, 100% { transform: rotate(0deg); }
    30% { transform: rotate(1.8deg); }
    70% { transform: rotate(-1.4deg); }
  }
  @keyframes cwsi-bloomopen-fall {
    0% { transform: translate(-8px, -16px) rotate(-34deg); opacity: 0; }
    12% { opacity: 0.65; }
    70% { opacity: 0.5; }
    100% { transform: translate(10px, 26px) rotate(38deg); opacity: 0; }
  }
  @keyframes cwsi-bloomopen-pollen {
    0%, 100% { transform: translate(0, 0); opacity: 0.3; }
    50% { transform: translate(2px, -3.4px); opacity: 0.6; }
  }
}
`;

export function BloomOpen({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className} style={style}
    >
      <defs>
        <linearGradient id="cwsi-bloomopen-petal" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={ACCENT_DEEP} />
          <stop offset="0.45" stopColor={ACCENT} />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="cwsi-bloomopen-mid" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={ACCENT} />
          <stop offset="1" stopColor={CREAM} stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="cwsi-bloomopen-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={OKER} stopOpacity="0.5" />
          <stop offset="1" stopColor={OKER_DEEP} stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: BLOOMOPEN_CSS }} />

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
        fill="url(#cwsi-bloomopen-leaf)"
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
        fill="url(#cwsi-bloomopen-leaf)"
        stroke={OKER_DEEP}
        strokeOpacity="0.5"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />

      {/* Sepals peeking out beneath the head */}
      <g fill={MUTED} fillOpacity="0.45">
        <path d="M60 64 C 56 62, 53 58.5, 52.5 54.5 C 56.5 56.5, 59.5 60, 60 64 Z" />
        <path d="M60 64 C 64 62, 67 58.5, 67.5 54.5 C 63.5 56.5, 60.5 60, 60 64 Z" />
      </g>

      {/* ── The head, local frame at (60,42) — unfolds, then sways ───────── */}
      <g transform="translate(60 42)">
        <g className="cwsi-bloomopen-sway">
          {/* Outer ring — fully open petals, first wave */}
          {OUTER_ANGLES.map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <g className="cwsi-bloomopen-pet">
                <path
                  d="M0 2.5 C -7.5 -3.5, -8.5 -15.5, 0 -23.5 C 8.5 -15.5, 7.5 -3.5, 0 2.5 Z"
                  fill="url(#cwsi-bloomopen-petal)"
                  fillOpacity="0.85"
                  stroke={ACCENT_DEEP}
                  strokeOpacity="0.5"
                  strokeWidth="0.75"
                  strokeLinejoin="round"
                />
                <path
                  d="M0 0 C -1 -6.5, -1 -13.5, 0 -19.5"
                  fill="none"
                  stroke={CREAM}
                  strokeOpacity="0.4"
                  strokeWidth="0.75"
                  strokeLinecap="round"
                />
              </g>
            </g>
          ))}

          {/* Mid ring — lighter, lifted into the gaps, second wave */}
          {MID_ANGLES.map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <g className="cwsi-bloomopen-pet cwsi-bloomopen-r2">
                <path
                  d="M0 2 C -5 -2.5, -5.5 -11, 0 -16.5 C 5.5 -11, 5 -2.5, 0 2 Z"
                  fill="url(#cwsi-bloomopen-mid)"
                  fillOpacity="0.9"
                  stroke={ACCENT_DEEP}
                  strokeOpacity="0.35"
                  strokeWidth="0.75"
                  strokeLinejoin="round"
                />
              </g>
            </g>
          ))}

          {/* Inner ring — still cupped, third wave */}
          {INNER_ANGLES.map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <g className="cwsi-bloomopen-pet cwsi-bloomopen-r3">
                <path
                  d="M0 1.5 C -3.2 -1.5, -3.5 -7, 0 -10.5 C 3.5 -7, 3.2 -1.5, 0 1.5 Z"
                  fill={CREAM}
                  fillOpacity="0.9"
                  stroke={ACCENT}
                  strokeOpacity="0.5"
                  strokeWidth="0.75"
                  strokeLinejoin="round"
                />
              </g>
            </g>
          ))}

          {/* Stamen crown — blooms last */}
          <g className="cwsi-bloomopen-crown">
            <g stroke={OKER} strokeOpacity="0.7" strokeWidth="0.75" fill="none" strokeLinecap="round">
              <path d="M0 0 C -2 -2.5, -3.5 -4.5, -5 -6" />
              <path d="M0 0 C 1.8 -2.7, 3.2 -4.5, 5 -6" />
              <path d="M0 0 C -3 -1, -5.5 -2, -7.2 -3.2" />
              <path d="M0 0 C 3 -1, 5.5 -2, 7.2 -3.2" />
              <path d="M0 0 C -1.8 2.2, -3.5 3.8, -5.4 4.8" />
              <path d="M0 0 C 1.8 2.2, 3.5 3.8, 5.4 4.8" />
            </g>
            <g fill={OKER_DEEP}>
              <circle cx="-5" cy="-6" r="1" fillOpacity="0.9" />
              <circle cx="5" cy="-6" r="1" fillOpacity="0.9" />
              <circle cx="-7.2" cy="-3.2" r="0.9" fillOpacity="0.85" />
              <circle cx="7.2" cy="-3.2" r="0.9" fillOpacity="0.85" />
              <circle cx="-5.4" cy="4.8" r="0.9" fillOpacity="0.8" />
              <circle cx="5.4" cy="4.8" r="0.9" fillOpacity="0.8" />
            </g>
            <circle r="3.2" fill={OKER} stroke={OKER_DEEP} strokeOpacity="0.6" strokeWidth="0.75" />
            <circle cx="-1" cy="-1" r="1" fill={CREAM} fillOpacity="0.85" />
          </g>
        </g>
      </g>

      {/* One petal let go — drifting down on a long loop */}
      <g transform="rotate(40 88 78)" opacity="0.6">
        <g className="cwsi-bloomopen-fall">
          <path
            d="M88 84 C 84 80.5, 83.5 73.5, 88 69 C 92.5 73.5, 92 80.5, 88 84 Z"
            fill="url(#cwsi-bloomopen-petal)"
            stroke={ACCENT_DEEP}
            strokeOpacity="0.4"
            strokeWidth="0.75"
          />
        </g>
      </g>

      {/* Pollen drifting on the air */}
      <circle className="cwsi-bloomopen-pollen" cx="82" cy="30" r="0.8" fill={OKER} fillOpacity="0.5" />
      <circle
        className="cwsi-bloomopen-pollen cwsi-bloomopen-pollen2"
        cx="36"
        cy="34"
        r="0.6"
        fill={OKER}
        fillOpacity="0.4"
      />
      <circle cx="90" cy="52" r="0.6" fill={ACCENT} fillOpacity="0.4" />
      <circle cx="30" cy="58" r="0.5" fill={ACCENT} fillOpacity="0.35" />
    </svg>
  );
}
