import type { CSSProperties } from "react";
/**
 * WaveDividerFlow — three wave strands flowing past each other in an endless,
 * seamless drift.
 *
 * Hand-authored ANIMATED inline SVG divider (server component, no client JS).
 * Each strand is drawn one full wavelength wider than the viewport and slides
 * exactly that wavelength per loop (translateX, linear), so the seam is
 * mathematically invisible. A static luminance mask melts both ends into the
 * page while the strands move beneath it. Motion is pure CSS in a scoped
 * <style> block, namespaced (`cwsi-waveflow-*`), every rule inside
 * `@media (prefers-reduced-motion: no-preference)` — reduced motion renders a
 * calm static sea. All paint reads the cw-* palette tokens with the engine
 * fallback chain. (Mask stops use the `white` keyword — alpha encoding, not
 * palette paint.)
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A smooth sine-like strand: alternating cubic arches above/below `baseY`,
 * one arch per `half` px, spanning `x0` → at least `xEnd`.
 */
function wavePath(baseY: number, amp: number, half: number, startUp: boolean, x0: number, xEnd: number): string {
  const k = half * 0.36;
  let d = `M${x0} ${baseY}`;
  let up = startUp;
  for (let x = x0; x < xEnd; x += half) {
    const peak = r2(up ? baseY - amp : baseY + amp);
    d += ` C ${r2(x + k)} ${peak}, ${r2(x + half - k)} ${peak}, ${r2(x + half)} ${baseY}`;
    up = !up;
  }
  return d;
}

/** Foam beads riding the fore strand's crests (one per 70px wavelength). */
const FOAM = Array.from({ length: 7 }, (_, i) => ({
  x: r2(11.5 + i * 70),
  y: i % 2 === 0 ? 7.5 : 7.7,
  r: i % 2 === 0 ? 1 : 0.85,
}));

/**
 * Compositor-only motion, all under the reduced-motion gate. Each layer's
 * travel distance equals its own wavelength, so every loop lands exactly on
 * the start frame (linear timing keeps the velocity constant).
 */
const WAVEFLOW_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-waveflow-l1 { animation: cwsi-waveflow-back 18s linear infinite; }
  .cwsi-waveflow-l2 { animation: cwsi-waveflow-fore 12s linear infinite; }
  .cwsi-waveflow-l3 { animation: cwsi-waveflow-sheen 10s linear infinite; }
  @keyframes cwsi-waveflow-back {
    from { transform: translateX(0); }
    to { transform: translateX(-90px); }
  }
  @keyframes cwsi-waveflow-fore {
    from { transform: translateX(0); }
    to { transform: translateX(-70px); }
  }
  /* The sheen runs against the swell — counter-current. */
  @keyframes cwsi-waveflow-sheen {
    from { transform: translateX(-56px); }
    to { transform: translateX(0); }
  }
}
`;

export function WaveDividerFlow({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 400 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className} style={style}
    >
      <defs>
        {/* Static edge-fade: the strands move, the melt stays put. */}
        <linearGradient
          id="cwsi-waveflow-fadegrad"
          x1="0"
          y1="0"
          x2="400"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.12" stopColor="white" stopOpacity="1" />
          <stop offset="0.88" stopColor="white" stopOpacity="1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="cwsi-waveflow-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="24">
          <rect x="0" y="0" width="400" height="24" fill="url(#cwsi-waveflow-fadegrad)" />
        </mask>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: WAVEFLOW_CSS }} />

      <g mask="url(#cwsi-waveflow-fade)">
        {/* Swell — a still ground-wave the strands flow over */}
        <path
          d={`${wavePath(14, 4, 55, true, -20, 420)} L 420 24 L -20 24 Z`}
          fill={ACCENT}
          fillOpacity="0.09"
        />

        {/* Back strand — broad and calm, λ = 90, one wavelength per 18s */}
        <g className="cwsi-waveflow-l1">
          <path
            d={wavePath(12, 4.6, 45, true, -12, 502)}
            fill="none"
            stroke={ACCENT}
            strokeOpacity="0.45"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </g>

        {/* Fore strand — tighter rhythm, deepest tone, λ = 70, carries foam */}
        <g className="cwsi-waveflow-l2">
          <path
            d={wavePath(12, 4.4, 35, true, -6, 484)}
            fill="none"
            stroke={ACCENT_DEEP}
            strokeOpacity="0.7"
            strokeWidth="1"
            strokeLinecap="round"
          />
          {FOAM.map((f, i) => (
            <circle
              key={i}
              cx={f.x}
              cy={f.y}
              r={f.r}
              fill={i % 2 === 0 ? OKER : ACCENT_DEEP}
              fillOpacity={i % 2 === 0 ? 0.55 : 0.5}
            />
          ))}
        </g>

        {/* Sheen strand — a fine warm thread running counter-current, λ = 56 */}
        <g className="cwsi-waveflow-l3">
          <path
            d={wavePath(10, 2.4, 28, true, -62, 414)}
            fill="none"
            stroke={OKER}
            strokeOpacity="0.5"
            strokeWidth="0.75"
            strokeLinecap="round"
          />
        </g>

        {/* Still mist + undertow flecks anchoring the scene */}
        <g fill={ACCENT} fillOpacity="0.25">
          <circle cx="48" cy="5.5" r="0.5" />
          <circle cx="186" cy="4.5" r="0.6" />
          <circle cx="326" cy="5.5" r="0.5" />
        </g>
        <g fill={MUTED} fillOpacity="0.35">
          <circle cx="88" cy="19.5" r="0.5" />
          <circle cx="228" cy="20" r="0.5" />
          <circle cx="368" cy="19.5" r="0.5" />
        </g>
      </g>
    </svg>
  );
}
