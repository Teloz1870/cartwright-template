/**
 * FireflyField — a dusk meadow where ten fireflies blink and drift in
 * staggered rhythm above the grass.
 *
 * Hand-authored, hero-grade ANIMATED inline SVG (server component, no client
 * JS). Motion is pure CSS in a scoped <style> block: compositor-only
 * transform/opacity keyframes, namespaced (`cwsi-firefly-*`), every rule
 * inside `@media (prefers-reduced-motion: no-preference)` — reduced motion
 * renders a field of softly glowing lights. All paint reads the cw-* palette
 * tokens with the engine fallback chain; gradient ids are stable.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const OKER_DEEP = "var(--color-cw-gold-deep, var(--color-cw-oker-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** Where the fireflies hang in the air (kept above the grass line). */
const FIREFLIES: ReadonlyArray<{ x: number; y: number; s: number }> = [
  { x: 22, y: 40, s: 1 },
  { x: 40, y: 56, s: 0.85 },
  { x: 58, y: 30, s: 0.9 },
  { x: 74, y: 48, s: 1.1 },
  { x: 92, y: 34, s: 0.8 },
  { x: 30, y: 74, s: 0.9 },
  { x: 52, y: 66, s: 1 },
  { x: 70, y: 78, s: 0.75 },
  { x: 88, y: 64, s: 0.95 },
  { x: 104, y: 50, s: 0.7 },
];

/**
 * Compositor-only motion, all under the reduced-motion gate. Each firefly
 * carries two animations — a long blink cycle (two brief flares per loop)
 * and an even longer wander — phase-shifted per insect so the field never
 * pulses in unison.
 */
const FIREFLY_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-firefly-f {
    transform-box: fill-box;
    transform-origin: center;
    animation:
      cwsi-firefly-blink 12s ease-in-out infinite,
      cwsi-firefly-drift 18s ease-in-out infinite;
  }
  .cwsi-firefly-f2 { animation-delay: -1.7s, -3s; }
  .cwsi-firefly-f3 { animation-delay: -3.1s, -6s; }
  .cwsi-firefly-f4 { animation-delay: -4.6s, -9s; }
  .cwsi-firefly-f5 { animation-delay: -6.2s, -12s; }
  .cwsi-firefly-f6 { animation-delay: -7.4s, -15s; }
  .cwsi-firefly-f7 { animation-delay: -8.9s, -2s; }
  .cwsi-firefly-f8 { animation-delay: -10.3s, -5s; }
  .cwsi-firefly-f9 { animation-delay: -11.1s, -8s; }
  .cwsi-firefly-f10 { animation-delay: -5.5s, -11s; }
  .cwsi-firefly-grass {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: cwsi-firefly-grass 10s ease-in-out infinite;
  }
  .cwsi-firefly-g2 { animation-delay: -3.3s; }
  .cwsi-firefly-g3 { animation-delay: -6.6s; }
  @keyframes cwsi-firefly-blink {
    0%, 26%, 100% { opacity: 0.42; }
    8% { opacity: 0.42; }
    11% { opacity: 1; }
    16% { opacity: 0.55; }
    56% { opacity: 0.4; }
    61% { opacity: 0.9; }
    67% { opacity: 0.46; }
  }
  @keyframes cwsi-firefly-drift {
    0%, 100% { transform: translate(0, 0); }
    30% { transform: translate(2.4px, -2.8px); }
    55% { transform: translate(-1.8px, -4.4px); }
    80% { transform: translate(-3px, 1.6px); }
  }
  @keyframes cwsi-firefly-grass {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(2.4deg); }
  }
}
`;

export function FireflyField({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <radialGradient id="cwsi-firefly-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={OKER} stopOpacity="0.85" />
          <stop offset="0.55" stopColor={OKER} stopOpacity="0.3" />
          <stop offset="1" stopColor={OKER} stopOpacity="0" />
        </radialGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: FIREFLY_CSS }} />

      {/* Dusk sky — a thin field of fixed stars */}
      <circle cx="18" cy="16" r="0.7" fill={MUTED} fillOpacity="0.45" />
      <circle cx="46" cy="12" r="0.5" fill={INK} fillOpacity="0.3" />
      <circle cx="78" cy="16" r="0.6" fill={MUTED} fillOpacity="0.4" />
      <circle cx="102" cy="12" r="0.5" fill={INK} fillOpacity="0.3" />
      <g stroke={INK} strokeOpacity="0.35" strokeWidth="0.75" strokeLinecap="round">
        <path d="M62 18 L62 21.4 M60.3 19.7 L63.7 19.7" />
      </g>

      {/* Meadow — two soft hills */}
      <path d="M0 104 C 30 96, 60 100, 90 96 C 100 95, 112 96.5, 120 98 L120 120 L0 120 Z" fill={INK} fillOpacity="0.07" />
      <path d="M0 110 C 36 104, 78 108, 120 104 L120 120 L0 120 Z" fill={MUTED} fillOpacity="0.12" />

      {/* Grass blades — three of them lean in the night air */}
      <g stroke={INK} strokeOpacity="0.4" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path className="cwsi-firefly-grass" d="M16 104 C 15 98, 15.5 93, 18 88" />
        <path d="M24 103 C 24.5 98.5, 24 95, 22.5 91" />
        <path className="cwsi-firefly-grass cwsi-firefly-g2" d="M58 102 C 57 96.5, 58 91, 61 86" />
        <path d="M66 102.5 C 67 98, 66.5 94.5, 65 90.5" />
        <path className="cwsi-firefly-grass cwsi-firefly-g3" d="M98 100 C 97 95, 97.5 90.5, 100 86" />
        <path d="M106 100.5 C 107 96.5, 106.5 93, 105 89.5" />
      </g>
      {/* A seed-head catching the last light */}
      <path d="M40 103 C 39.5 96, 40.5 90, 43 84" fill="none" stroke={INK} strokeOpacity="0.45" strokeWidth="0.75" strokeLinecap="round" />
      <circle cx="43.3" cy="83" r="1.4" fill={OKER_DEEP} fillOpacity="0.55" />

      {/* The fireflies — staggered blinks, slow wander */}
      {FIREFLIES.map((f, i) => (
        <g key={i} transform={`translate(${f.x} ${f.y}) scale(${f.s})`}>
          <g className={`cwsi-firefly-f cwsi-firefly-f${i + 1}`}>
            <circle r="3.4" fill="url(#cwsi-firefly-glow)" />
            <circle r="0.9" fill={OKER} fillOpacity="0.95" />
            <circle cx="-0.3" cy="-0.3" r="0.35" fill={CREAM} fillOpacity="0.9" />
          </g>
        </g>
      ))}

      {/* One warm companion spark low in the grass */}
      <circle cx="14" cy="92" r="0.7" fill={ACCENT} fillOpacity="0.4" />
      <circle cx="112" cy="90" r="0.6" fill={ACCENT} fillOpacity="0.35" />
    </svg>
  );
}
