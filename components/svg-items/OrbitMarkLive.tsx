/**
 * OrbitMarkLive — the ringed planet with both moons actually riding their
 * orbits while the planet softly breathes.
 *
 * Hand-authored, hero-grade ANIMATED inline SVG (server component, no client
 * JS). Motion is pure CSS in a scoped <style> block: each moon's elliptical
 * track is sampled into transform/opacity keyframes (the moon dims on the far
 * arc, so depth reads without z-order tricks). Namespaced (`cwsi-orbitlive-*`),
 * every rule inside `@media (prefers-reduced-motion: no-preference)` — reduced
 * motion renders the moons resting on their orbits. All paint reads the cw-*
 * palette tokens with the engine fallback chain.
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

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sample an a×b ellipse into translate keyframes (24 stops ≈ smooth), with the
 * moon dimming on the far arc (negative-y half in the orbit's local frame).
 */
function orbitFrames(a: number, b: number, reverse = false): string {
  const steps = 24;
  const frames: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (reverse ? -1 : 1) * (i / steps) * Math.PI * 2;
    const pct = r2((i / steps) * 100);
    const x = r2(a * Math.cos(t));
    const y = r2(b * Math.sin(t));
    const o = r2(0.45 + 0.55 * ((Math.sin(t) + 1) / 2));
    frames.push(`${pct}% { transform: translate(${x}px, ${y}px); opacity: ${o}; }`);
  }
  return frames.join("\n    ");
}

/** Compositor-only motion, all under the reduced-motion gate. */
const ORBITLIVE_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-orbitlive-moona {
    animation: cwsi-orbitlive-orbita 16s linear infinite;
  }
  .cwsi-orbitlive-moonb {
    animation: cwsi-orbitlive-orbitb 23s linear infinite;
    animation-delay: -11.5s;
  }
  .cwsi-orbitlive-planet {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-orbitlive-breathe 12s ease-in-out infinite;
  }
  .cwsi-orbitlive-halo {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-orbitlive-halo 12s ease-in-out infinite;
  }
  .cwsi-orbitlive-tw {
    animation: cwsi-orbitlive-twinkle 9s ease-in-out infinite;
  }
  .cwsi-orbitlive-tw2 { animation-delay: -3s; }
  .cwsi-orbitlive-tw3 { animation-delay: -6s; }
  @keyframes cwsi-orbitlive-orbita {
    ${orbitFrames(46, 18)}
  }
  @keyframes cwsi-orbitlive-orbitb {
    ${orbitFrames(50, 24, true)}
  }
  @keyframes cwsi-orbitlive-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
  @keyframes cwsi-orbitlive-halo {
    0%, 100% { transform: scale(1); opacity: 0.85; }
    50% { transform: scale(1.06); opacity: 1; }
  }
  @keyframes cwsi-orbitlive-twinkle {
    0%, 70%, 100% { opacity: 0.55; }
    85% { opacity: 1; }
  }
}
`;

export function OrbitMarkLive({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <radialGradient id="cwsi-orbitlive-planet" cx="0.34" cy="0.3" r="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.38" stopColor={ACCENT} />
          <stop offset="1" stopColor={ACCENT_DEEP} />
        </radialGradient>
        <radialGradient id="cwsi-orbitlive-moon" cx="0.35" cy="0.32" r="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="1" stopColor={SAND} />
        </radialGradient>
        <clipPath id="cwsi-orbitlive-clip">
          <circle cx="60" cy="60" r="17" />
        </clipPath>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: ORBITLIVE_CSS }} />

      {/* Atmosphere halo — breathes with the planet */}
      <circle className="cwsi-orbitlive-halo" cx="60" cy="60" r="27" fill={ACCENT} fillOpacity="0.06" />
      <circle className="cwsi-orbitlive-halo" cx="60" cy="60" r="21.5" fill={ACCENT} fillOpacity="0.07" />

      {/* Orbit A — wide, tilted left (full ellipse; the moon rides it live) */}
      <g transform="translate(60 60) rotate(-20)">
        <path
          d="M-46 0 A 46 18 0 0 1 46 0"
          fill="none"
          stroke={INK}
          strokeOpacity="0.22"
          strokeWidth="1"
        />
        <path
          d="M-46 0 A 46 18 0 0 0 46 0"
          fill="none"
          stroke={ACCENT_DEEP}
          strokeOpacity="0.55"
          strokeWidth="1.25"
        />
      </g>

      {/* Orbit B — narrower, tilted right */}
      <g transform="translate(60 60) rotate(28)">
        <path
          d="M-50 0 A 50 24 0 0 1 50 0"
          fill="none"
          stroke={INK}
          strokeOpacity="0.18"
          strokeWidth="0.75"
        />
        <path
          d="M-50 0 A 50 24 0 0 0 50 0"
          fill="none"
          stroke={ACCENT}
          strokeOpacity="0.45"
          strokeWidth="1"
        />
      </g>

      {/* Planet body — gradient disc with surface detail, gently breathing */}
      <circle
        className="cwsi-orbitlive-planet"
        cx="60"
        cy="60"
        r="17"
        fill="url(#cwsi-orbitlive-planet)"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <g clipPath="url(#cwsi-orbitlive-clip)">
        <g stroke={CREAM} strokeOpacity="0.35" strokeWidth="0.75" fill="none" strokeLinecap="round">
          <path d="M43.5 53 Q 60 58.5 76.5 53" />
          <path d="M43 61.5 Q 60 67 77 61.5" />
          <path d="M45 69.5 Q 60 74.5 75 69.5" />
        </g>
        <ellipse cx="70.5" cy="60" rx="13" ry="18" fill={INK} fillOpacity="0.13" />
        <ellipse
          cx="53"
          cy="51.5"
          rx="6.5"
          ry="3.6"
          transform="rotate(-28 53 51.5)"
          fill={CREAM}
          fillOpacity="0.45"
        />
      </g>

      {/* Moon A — the large pale moon, riding orbit A (16s lap) */}
      <g transform="translate(60 60) rotate(-20)">
        <g className="cwsi-orbitlive-moona" transform="translate(46 0)">
          <circle r="4.6" fill={ACCENT} fillOpacity="0.12" />
          <circle r="3.4" fill="url(#cwsi-orbitlive-moon)" stroke={MUTED} strokeOpacity="0.6" strokeWidth="0.75" />
          <path d="M1 -3.2 A 3.4 3.4 0 0 1 1 3.2 A 4.6 4.6 0 0 0 1 -3.2 Z" fill={INK} fillOpacity="0.18" />
          <circle cx="-1.1" cy="0.4" r="0.55" fill={MUTED} fillOpacity="0.55" />
          <circle cx="0.2" cy="-1.4" r="0.4" fill={MUTED} fillOpacity="0.45" />
        </g>
      </g>

      {/* Moon B — the small warm moon, counter-orbiting on B (23s lap) */}
      <g transform="translate(60 60) rotate(28)">
        <g className="cwsi-orbitlive-moonb" transform="translate(-50 0)">
          <circle r="3.4" fill={OKER} fillOpacity="0.14" />
          <circle r="2.4" fill={OKER} fillOpacity="0.9" />
          <circle cx="-0.7" cy="-0.7" r="0.6" fill={CREAM} fillOpacity="0.85" />
        </g>
      </g>

      {/* Field stars — three of them twinkle in turn */}
      <g className="cwsi-orbitlive-tw" stroke={INK} strokeOpacity="0.4" strokeWidth="0.75" strokeLinecap="round">
        <path d="M22 25 L22 30 M19.5 27.5 L24.5 27.5" />
      </g>
      <g stroke={INK} strokeOpacity="0.4" strokeWidth="0.75" strokeLinecap="round">
        <path d="M98 36.5 L98 40.5 M96 38.5 L100 38.5" />
      </g>
      <g className="cwsi-orbitlive-tw cwsi-orbitlive-tw2" stroke={OKER} strokeOpacity="0.55" strokeWidth="0.75" strokeLinecap="round">
        <path d="M89 91 L89 94.4 M87.3 92.7 L90.7 92.7" />
      </g>
      <circle cx="31" cy="95" r="1" fill={MUTED} fillOpacity="0.55" />
      <circle cx="104" cy="67" r="0.8" fill={INK} fillOpacity="0.35" />
      <circle cx="14" cy="62" r="0.7" fill={INK} fillOpacity="0.3" />
      <circle className="cwsi-orbitlive-tw cwsi-orbitlive-tw3" cx="72" cy="18" r="0.9" fill={ACCENT} fillOpacity="0.5" />
      <circle cx="44" cy="13" r="0.6" fill={MUTED} fillOpacity="0.45" />
    </svg>
  );
}
