import type { CSSProperties } from "react";
/**
 * AuroraRibbon — layered aurora ribbons undulating in slow counter-phase,
 * shimmering like northern lights stretched into a rule.
 *
 * Hand-authored ANIMATED inline SVG divider (server component, no client JS).
 * Motion is pure CSS in a scoped <style> block: compositor-only
 * transform/opacity keyframes (gentle translate + skew + shimmer), namespaced
 * (`cwsi-aurora-*`), every rule inside
 * `@media (prefers-reduced-motion: no-preference)` — reduced motion renders a
 * still aurora. All paint reads the cw-* palette tokens with the engine
 * fallback chain; every ribbon fades out at both ends via its gradient.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/**
 * Compositor-only motion, all under the reduced-motion gate. The three
 * ribbons breathe on different periods and directions (matching first/last
 * keyframes keep each loop seamless), so the curtain never repeats visibly.
 */
const AURORA_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-aurora-r1,
  .cwsi-aurora-r2,
  .cwsi-aurora-r3 {
    transform-box: fill-box;
    transform-origin: center;
  }
  .cwsi-aurora-r1 { animation: cwsi-aurora-wavea 14s ease-in-out infinite; }
  .cwsi-aurora-r2 { animation: cwsi-aurora-waveb 17s ease-in-out infinite; animation-delay: -5s; }
  .cwsi-aurora-r3 { animation: cwsi-aurora-wavea 20s ease-in-out infinite; animation-delay: -11s; }
  .cwsi-aurora-tw { animation: cwsi-aurora-twinkle 11s ease-in-out infinite; }
  .cwsi-aurora-tw2 { animation-delay: -3.7s; }
  .cwsi-aurora-tw3 { animation-delay: -7.4s; }
  @keyframes cwsi-aurora-wavea {
    0%, 100% { transform: translate(0, 0) skewX(0deg); opacity: 0.75; }
    35% { transform: translate(2.6px, -1.4px) skewX(1.4deg); opacity: 1; }
    70% { transform: translate(-2px, 0.8px) skewX(-1deg); opacity: 0.85; }
  }
  @keyframes cwsi-aurora-waveb {
    0%, 100% { transform: translate(0, 0) skewX(0deg); opacity: 0.8; }
    40% { transform: translate(-2.8px, 1.2px) skewX(-1.6deg); opacity: 1; }
    75% { transform: translate(2.2px, -0.8px) skewX(1.1deg); opacity: 0.8; }
  }
  @keyframes cwsi-aurora-twinkle {
    0%, 64%, 100% { opacity: 0.4; }
    78% { opacity: 1; }
  }
}
`;

export function AuroraRibbon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 400 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className} style={style}
    >
      <defs>
        <linearGradient id="cwsi-aurora-g1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0" />
          <stop offset="0.18" stopColor={ACCENT} stopOpacity="0.5" />
          <stop offset="0.5" stopColor={ACCENT} stopOpacity="0.75" />
          <stop offset="0.82" stopColor={ACCENT} stopOpacity="0.5" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cwsi-aurora-g2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={OKER} stopOpacity="0" />
          <stop offset="0.22" stopColor={OKER} stopOpacity="0.55" />
          <stop offset="0.55" stopColor={OKER} stopOpacity="0.8" />
          <stop offset="0.85" stopColor={OKER} stopOpacity="0.45" />
          <stop offset="1" stopColor={OKER} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cwsi-aurora-g3" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={ACCENT_DEEP} stopOpacity="0" />
          <stop offset="0.15" stopColor={ACCENT_DEEP} stopOpacity="0.45" />
          <stop offset="0.48" stopColor={ACCENT_DEEP} stopOpacity="0.65" />
          <stop offset="0.86" stopColor={ACCENT_DEEP} stopOpacity="0.4" />
          <stop offset="1" stopColor={ACCENT_DEEP} stopOpacity="0" />
        </linearGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: AURORA_CSS }} />

      {/* Upper ribbon — the broad accent curtain */}
      <path
        className="cwsi-aurora-r1"
        d="M-8 8.5 C 56 3, 124 13.5, 196 8.5 C 268 3.5, 336 13, 408 7.5 L408 11 C 336 16.5, 268 7, 196 12 C 124 17, 56 6.5, -8 12 Z"
        fill="url(#cwsi-aurora-g1)"
      />

      {/* Middle ribbon — the warm counter-wave */}
      <path
        className="cwsi-aurora-r2"
        d="M-8 13.5 C 64 18.5, 136 8.5, 208 13.5 C 280 18.5, 344 9.5, 408 14 L408 16.5 C 344 12, 280 21, 208 16 C 136 11, 64 21, -8 16 Z"
        fill="url(#cwsi-aurora-g2)"
      />

      {/* Lower ribbon — the deep thin trailing veil */}
      <path
        className="cwsi-aurora-r3"
        d="M-8 18 C 72 14.5, 152 21, 232 17.5 C 304 14.5, 360 20, 408 17 L408 18.6 C 360 21.6, 304 16.2, 232 19.4 C 152 22.8, 72 16.2, -8 19.8 Z"
        fill="url(#cwsi-aurora-g3)"
      />

      {/* A hairline horizon the curtain hangs from */}
      <path
        d="M22 4.5 L378 4.5"
        stroke={INK}
        strokeOpacity="0.1"
        strokeWidth="0.5"
        strokeLinecap="round"
        strokeDasharray="0.5 6"
      />

      {/* Night sparks above and below the curtain */}
      <circle className="cwsi-aurora-tw" cx="58" cy="3.5" r="0.7" fill={CREAM} fillOpacity="0.9" />
      <circle className="cwsi-aurora-tw cwsi-aurora-tw2" cx="210" cy="2.8" r="0.6" fill={OKER} fillOpacity="0.8" />
      <circle className="cwsi-aurora-tw cwsi-aurora-tw3" cx="338" cy="3.8" r="0.6" fill={CREAM} fillOpacity="0.85" />
      <circle cx="124" cy="2.5" r="0.5" fill={MUTED} fillOpacity="0.5" />
      <circle cx="282" cy="3.5" r="0.5" fill={MUTED} fillOpacity="0.45" />
      <circle cx="96" cy="21.5" r="0.5" fill={ACCENT} fillOpacity="0.35" />
      <circle cx="312" cy="21.5" r="0.5" fill={ACCENT} fillOpacity="0.3" />
    </svg>
  );
}
