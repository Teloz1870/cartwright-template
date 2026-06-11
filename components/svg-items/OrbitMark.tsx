/**
 * OrbitMark — a ringed planet held by two elliptical orbits with moons.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * All paint reads the cw-* palette tokens with the engine fallback chain, so
 * the mark adapts to whichever palette the shop runs — no hex values live
 * here. Gradient ids are stable and namespaced (`cwsi-orbit-*`); duplicate
 * instances resolve to identical paint, so no useId is needed.
 *
 * Opt-in hover motion: render inside an element carrying the `cwsi-animate`
 * class and the mark wakes on hover (planet breathes, moons bob, halo glows).
 * Without that class — or under reduced motion — nothing ever moves.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

/** Hover-only motion, gated on both `.cwsi-animate` and reduced-motion. */
const ORBIT_HOVER_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-animate:hover .cwsi-orbit-hov-planet {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-orbit-hovbreathe 4s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-orbit-hov-halo {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-orbit-hovhalo 4s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-orbit-hov-moon {
    animation: cwsi-orbit-hovbob 3.4s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-orbit-hov-moon2 {
    animation-delay: -1.7s;
  }
  @keyframes cwsi-orbit-hovbreathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
  @keyframes cwsi-orbit-hovhalo {
    0%, 100% { transform: scale(1); opacity: 0.85; }
    50% { transform: scale(1.05); opacity: 1; }
  }
  @keyframes cwsi-orbit-hovbob {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(1.2px, -0.9px); }
  }
}
`;

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const SAND = "var(--color-cw-sand, var(--color-cw-stone-100, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

export function OrbitMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <radialGradient id="cwsi-orbit-planet" cx="0.34" cy="0.3" r="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.38" stopColor={ACCENT} />
          <stop offset="1" stopColor={ACCENT_DEEP} />
        </radialGradient>
        <radialGradient id="cwsi-orbit-moon" cx="0.35" cy="0.32" r="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="1" stopColor={SAND} />
        </radialGradient>
        <clipPath id="cwsi-orbit-clip">
          <circle cx="60" cy="60" r="17" />
        </clipPath>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: ORBIT_HOVER_CSS }} />

      {/* Atmosphere halo — two soft accent washes behind everything */}
      <circle className="cwsi-orbit-hov-halo" cx="60" cy="60" r="27" fill={ACCENT} fillOpacity="0.06" />
      <circle className="cwsi-orbit-hov-halo" cx="60" cy="60" r="21.5" fill={ACCENT} fillOpacity="0.07" />

      {/* Orbit A — wide, tilted left. Far half drawn behind the planet. */}
      <g transform="translate(60 60) rotate(-20)">
        <path
          d="M-46 0 A 46 18 0 0 1 46 0"
          fill="none"
          stroke={INK}
          strokeOpacity="0.22"
          strokeWidth="1"
        />
        {/* Far moonlet riding the back of the orbit */}
        <circle cx="-14" cy="-17.2" r="1.6" fill={MUTED} fillOpacity="0.65" />
      </g>

      {/* Orbit B — narrower, tilted right. Far half behind the planet. */}
      <g transform="translate(60 60) rotate(28)">
        <path
          d="M-50 0 A 50 24 0 0 1 50 0"
          fill="none"
          stroke={INK}
          strokeOpacity="0.18"
          strokeWidth="0.75"
        />
      </g>

      {/* Planet body */}
      <circle
        className="cwsi-orbit-hov-planet"
        cx="60"
        cy="60"
        r="17"
        fill="url(#cwsi-orbit-planet)"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      {/* Surface detail — latitude bands, terminator shade, polar highlight */}
      <g clipPath="url(#cwsi-orbit-clip)">
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

      {/* Orbit A — near half sweeps in front, carrying the large moon */}
      <g transform="translate(60 60) rotate(-20)">
        <path
          d="M-46 0 A 46 18 0 0 0 46 0"
          fill="none"
          stroke={ACCENT_DEEP}
          strokeOpacity="0.55"
          strokeWidth="1.25"
        />
        <g transform="translate(23 15.6)">
          <g className="cwsi-orbit-hov-moon">
            <circle r="4.6" fill={ACCENT} fillOpacity="0.12" />
            <circle r="3.4" fill="url(#cwsi-orbit-moon)" stroke={MUTED} strokeOpacity="0.6" strokeWidth="0.75" />
            {/* Crescent shade + crater dimples */}
            <path d="M1 -3.2 A 3.4 3.4 0 0 1 1 3.2 A 4.6 4.6 0 0 0 1 -3.2 Z" fill={INK} fillOpacity="0.18" />
            <circle cx="-1.1" cy="0.4" r="0.55" fill={MUTED} fillOpacity="0.55" />
            <circle cx="0.2" cy="-1.4" r="0.4" fill={MUTED} fillOpacity="0.45" />
          </g>
        </g>
      </g>

      {/* Orbit B — near half in front, with the small warm moon */}
      <g transform="translate(60 60) rotate(28)">
        <path
          d="M-50 0 A 50 24 0 0 0 50 0"
          fill="none"
          stroke={ACCENT}
          strokeOpacity="0.45"
          strokeWidth="1"
        />
        <g transform="translate(-25 20.8)">
          <g className="cwsi-orbit-hov-moon cwsi-orbit-hov-moon2">
            <circle r="3.4" fill={OKER} fillOpacity="0.14" />
            <circle r="2.4" fill={OKER} fillOpacity="0.9" />
            <circle cx="-0.7" cy="-0.7" r="0.6" fill={CREAM} fillOpacity="0.85" />
          </g>
        </g>
      </g>

      {/* Field stars — fine crosses and dots of varied weight */}
      <g stroke={INK} strokeOpacity="0.4" strokeWidth="0.75" strokeLinecap="round">
        <path d="M22 25 L22 30 M19.5 27.5 L24.5 27.5" />
        <path d="M98 36.5 L98 40.5 M96 38.5 L100 38.5" />
      </g>
      <g stroke={OKER} strokeOpacity="0.55" strokeWidth="0.75" strokeLinecap="round">
        <path d="M89 91 L89 94.4 M87.3 92.7 L90.7 92.7" />
      </g>
      <circle cx="31" cy="95" r="1" fill={MUTED} fillOpacity="0.55" />
      <circle cx="104" cy="67" r="0.8" fill={INK} fillOpacity="0.35" />
      <circle cx="14" cy="62" r="0.7" fill={INK} fillOpacity="0.3" />
      <circle cx="72" cy="18" r="0.9" fill={ACCENT} fillOpacity="0.5" />
      <circle cx="44" cy="13" r="0.6" fill={MUTED} fillOpacity="0.45" />
    </svg>
  );
}
