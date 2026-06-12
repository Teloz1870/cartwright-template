/**
 * WaveDivider — a horizontal rule of layered, flowing waves.
 *
 * Hand-authored inline SVG divider (server component, no client JS).
 * Four wave strands at different wavelengths and weights drift past each
 * other; every strand fades out at both ends via namespaced gradients
 * (`cwsi-wave-*`) so the divider melts into the page. All paint reads the
 * cw-* palette tokens with the engine fallback chain.
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
 * one arch per `half` px, spanning slightly past both edges.
 */
function wavePath(baseY: number, amp: number, half: number, startUp: boolean, x0 = -6): string {
  const k = half * 0.36;
  let d = `M${x0} ${baseY}`;
  let up = startUp;
  for (let x = x0; x < 406; x += half) {
    const peak = r2(up ? baseY - amp : baseY + amp);
    d += ` C ${r2(x + k)} ${peak}, ${r2(x + half - k)} ${peak}, ${r2(x + half)} ${baseY}`;
    up = !up;
  }
  return d;
}

/** Foam beads hovering just above the crests of the foreground strand
    (up-arch midpoints at x = 23.5 + n·70; crest height ≈ 8.7). */
const FOAM: ReadonlyArray<{ x: number; y: number; r: number; c: string; o: number }> = [
  { x: 23.5, y: 7.6, r: 0.9, c: OKER, o: 0.5 },
  { x: 93.5, y: 7.4, r: 1.1, c: ACCENT_DEEP, o: 0.55 },
  { x: 163.5, y: 7.6, r: 0.9, c: OKER, o: 0.6 },
  { x: 233.5, y: 7.4, r: 1.2, c: ACCENT_DEEP, o: 0.6 },
  { x: 303.5, y: 7.6, r: 0.9, c: OKER, o: 0.55 },
  { x: 373.5, y: 7.5, r: 1, c: ACCENT_DEEP, o: 0.5 },
  { x: 58.5, y: 16.6, r: 0.7, c: ACCENT, o: 0.45 },
  { x: 198.5, y: 16.6, r: 0.8, c: ACCENT, o: 0.45 },
  { x: 338.5, y: 16.4, r: 0.7, c: ACCENT, o: 0.4 },
];

export function WaveDivider({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="cwsi-wave-fill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0" />
          <stop offset="0.14" stopColor={ACCENT} stopOpacity="0.1" />
          <stop offset="0.86" stopColor={ACCENT} stopOpacity="0.1" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cwsi-wave-back" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0" />
          <stop offset="0.12" stopColor={ACCENT} stopOpacity="0.45" />
          <stop offset="0.88" stopColor={ACCENT} stopOpacity="0.45" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cwsi-wave-fore" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={ACCENT_DEEP} stopOpacity="0" />
          <stop offset="0.1" stopColor={ACCENT_DEEP} stopOpacity="0.75" />
          <stop offset="0.9" stopColor={ACCENT_DEEP} stopOpacity="0.75" />
          <stop offset="1" stopColor={ACCENT_DEEP} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cwsi-wave-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={OKER} stopOpacity="0" />
          <stop offset="0.16" stopColor={OKER} stopOpacity="0.5" />
          <stop offset="0.84" stopColor={OKER} stopOpacity="0.5" />
          <stop offset="1" stopColor={OKER} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Swell — a filled ground-wave washing along the bottom */}
      <path d={`${wavePath(14, 4, 55, true, -20)} L 406 24 L -6 24 Z`} fill="url(#cwsi-wave-fill)" />

      {/* Deep strand — the slowest swell, barely surfacing */}
      <path
        d={wavePath(15, 2.6, 62, false, -30)}
        fill="none"
        stroke="url(#cwsi-wave-back)"
        strokeWidth="0.75"
        strokeOpacity="0.6"
        strokeLinecap="round"
      />

      {/* Back strand — broad and calm */}
      <path
        d={wavePath(12, 4.5, 45, true, -12)}
        fill="none"
        stroke="url(#cwsi-wave-back)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      {/* Fore strand — tighter rhythm, deepest tone */}
      <path
        d={wavePath(12, 4.4, 35, true, 6)}
        fill="none"
        stroke="url(#cwsi-wave-fore)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Sheen strand — a fine warm thread skimming the crests */}
      <path
        d={wavePath(10, 2.4, 35, true, -8)}
        fill="none"
        stroke="url(#cwsi-wave-sheen)"
        strokeWidth="0.75"
        strokeLinecap="round"
      />

      {/* Foam beads on the crests */}
      {FOAM.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r={f.r} fill={f.c} fillOpacity={f.o} />
      ))}
      {/* Spray ticks lifting off the crests */}
      <g stroke={ACCENT_DEEP} strokeOpacity="0.35" strokeWidth="0.75" strokeLinecap="round" fill="none">
        <path d="M27 6.2 C 28.5 4.8, 30.5 4, 33 4" />
        <path d="M167 6.2 C 168.5 4.8, 170.5 4, 173 4" />
        <path d="M237 6 C 238.5 4.6, 240.5 3.8, 243 3.8" />
        <path d="M307 6.2 C 308.5 4.8, 310.5 4, 313 4" />
      </g>
      {/* Mist drifting above the swell */}
      <g fill={ACCENT} fillOpacity="0.25">
        <circle cx="48" cy="11" r="0.5" />
        <circle cx="126" cy="10" r="0.6" />
        <circle cx="186" cy="12" r="0.5" />
        <circle cx="266" cy="10.5" r="0.6" />
        <circle cx="326" cy="11.5" r="0.5" />
        <circle cx="386" cy="10" r="0.5" />
      </g>
      {/* Undertow flecks below the strands */}
      <g fill={MUTED} fillOpacity="0.35">
        <circle cx="88" cy="19.5" r="0.5" />
        <circle cx="228" cy="20" r="0.5" />
        <circle cx="368" cy="19.5" r="0.5" />
      </g>
    </svg>
  );
}
