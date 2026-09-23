import type { CSSProperties } from "react";
/**
 * ConstellationTwinkle — a star chart whose asterism pulses in sequence,
 * visited by a shooting star roughly every fifteen seconds.
 *
 * Hand-authored, hero-grade ANIMATED inline SVG (server component, no client
 * JS). Motion is pure CSS in a scoped <style> block: compositor-only
 * transform/opacity keyframes, namespaced (`cwsi-twinkle-*`), every rule
 * inside `@media (prefers-reduced-motion: no-preference)` — reduced motion
 * renders the full chart with a quiet meteor streak. All paint reads the cw-*
 * palette tokens with the engine fallback chain.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */
import type { ReactElement } from "react";

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** The asterism, drawn in connection order (S8 loops back to S3). */
const STARS: ReadonlyArray<{ x: number; y: number; m: 1 | 2 | 3 }> = [
  { x: 28, y: 68, m: 2 },
  { x: 42, y: 52, m: 1 },
  { x: 57, y: 60, m: 3 },
  { x: 70, y: 42, m: 1 },
  { x: 88, y: 52, m: 2 },
  { x: 94, y: 72, m: 3 },
  { x: 76, y: 82, m: 2 },
  { x: 56, y: 78, m: 3 },
];

/** Chart-ring tick marks every 30° on the r=53 circle. */
const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    x1: r(60 + 50.5 * Math.cos(a)),
    y1: r(60 + 50.5 * Math.sin(a)),
    x2: r(60 + 53 * Math.cos(a)),
    y2: r(60 + 53 * Math.sin(a)),
  };
});

/**
 * Compositor-only motion, all under the reduced-motion gate. The pulse walks
 * the asterism in connection order (one stagger step per star); the meteor
 * crosses the chart once per 15s cycle and stays hidden the rest of it.
 */
const TWINKLE_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-twinkle-s {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-twinkle-pulse 9.6s ease-in-out infinite;
  }
  .cwsi-twinkle-s2 { animation-delay: -8.4s; }
  .cwsi-twinkle-s3 { animation-delay: -7.2s; }
  .cwsi-twinkle-s4 { animation-delay: -6s; }
  .cwsi-twinkle-s5 { animation-delay: -4.8s; }
  .cwsi-twinkle-s6 { animation-delay: -3.6s; }
  .cwsi-twinkle-s7 { animation-delay: -2.4s; }
  .cwsi-twinkle-s8 { animation-delay: -1.2s; }
  .cwsi-twinkle-companion {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-twinkle-pulse 9.6s ease-in-out infinite;
    animation-delay: -5.4s;
  }
  .cwsi-twinkle-meteor {
    animation: cwsi-twinkle-shoot 15s linear infinite;
  }
  @keyframes cwsi-twinkle-pulse {
    0%, 76%, 100% { transform: scale(1); opacity: 0.88; }
    84% { transform: scale(1.3); opacity: 1; }
    92% { transform: scale(1); opacity: 0.85; }
  }
  @keyframes cwsi-twinkle-shoot {
    0% { transform: translate(24px, 16px); opacity: 0; }
    1.4% { opacity: 0.95; }
    7% { transform: translate(92px, 46px); opacity: 0; }
    100% { transform: translate(92px, 46px); opacity: 0; }
  }
}
`;

/** One star at the given magnitude: 1 = lucida, 2 = bright, 3 = faint. */
function Star({ x, y, m }: { x: number; y: number; m: 1 | 2 | 3 }): ReactElement {
  if (m === 3) {
    return <circle cx={x} cy={y} r="1.1" fill={MUTED} fillOpacity="0.85" />;
  }
  if (m === 2) {
    return (
      <g>
        <circle cx={x} cy={y} r="4" fill={ACCENT} fillOpacity="0.12" />
        <circle cx={x} cy={y} r="1.7" fill={ACCENT_DEEP} fillOpacity="0.9" />
        <circle cx={x - 0.5} cy={y - 0.5} r="0.5" fill={CREAM} fillOpacity="0.85" />
      </g>
    );
  }
  return (
    <g>
      <circle cx={x} cy={y} r="6.5" fill={ACCENT} fillOpacity="0.14" />
      <path
        d={`M${x} ${y - 4.6} L${x + 1.1} ${y - 1.1} L${x + 4.6} ${y} L${x + 1.1} ${y + 1.1} L${x} ${y + 4.6} L${x - 1.1} ${y + 1.1} L${x - 4.6} ${y} L${x - 1.1} ${y - 1.1} Z`}
        fill={ACCENT}
        fillOpacity="0.85"
      />
      <circle cx={x} cy={y} r="1.6" fill={ACCENT_DEEP} />
      <circle cx={x - 0.5} cy={y - 0.6} r="0.55" fill={CREAM} fillOpacity="0.9" />
    </g>
  );
}

export function ConstellationTwinkle({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className} style={style}
    >
      <style dangerouslySetInnerHTML={{ __html: TWINKLE_CSS }} />

      {/* Chart ring with graduation ticks + an inner dotted orbit */}
      <circle cx="60" cy="60" r="53" fill="none" stroke={INK} strokeOpacity="0.16" strokeWidth="0.75" />
      <g stroke={INK} strokeOpacity="0.28" strokeWidth="0.75" strokeLinecap="round">
        {TICKS.map((t, i) => (
          <path key={i} d={`M${t.x1} ${t.y1} L${t.x2} ${t.y2}`} />
        ))}
      </g>
      <circle
        cx="60"
        cy="60"
        r="46"
        fill="none"
        stroke={INK}
        strokeOpacity="0.1"
        strokeWidth="0.75"
        strokeDasharray="0.5 5"
        strokeLinecap="round"
      />

      {/* Connecting hairlines, S1→…→S8, looping back to S3 */}
      <g stroke={INK} strokeOpacity="0.32" strokeWidth="0.75" strokeLinecap="round">
        {STARS.slice(0, -1).map((s, i) => {
          const n = STARS[i + 1];
          return <path key={i} d={`M${s.x} ${s.y} L${n.x} ${n.y}`} />;
        })}
        <path d={`M${STARS[7].x} ${STARS[7].y} L${STARS[2].x} ${STARS[2].y}`} />
      </g>
      {/* Dashed pointer from the lucida toward an outlying companion */}
      <path
        d="M70 42 L52 27"
        stroke={ACCENT_DEEP}
        strokeOpacity="0.3"
        strokeWidth="0.75"
        strokeDasharray="2 3"
        strokeLinecap="round"
      />
      <g className="cwsi-twinkle-companion">
        <circle cx="50" cy="25.5" r="1.2" fill={OKER} fillOpacity="0.8" />
        <circle cx="50" cy="25.5" r="3" fill={OKER} fillOpacity="0.12" />
      </g>

      {/* The asterism — each star pulses in connection order */}
      {STARS.map((s, i) => (
        <g key={i} className={`cwsi-twinkle-s cwsi-twinkle-s${i + 1}`}>
          <Star x={s.x} y={s.y} m={s.m} />
        </g>
      ))}

      {/* The shooting star — a brief diagonal visitor, then 14s of night */}
      <g className="cwsi-twinkle-meteor" transform="translate(24 16)" opacity="0.5">
        <path
          d="M0 0 L-14 -6"
          stroke={OKER}
          strokeOpacity="0.35"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M0 0 L-11 -4.7"
          stroke={OKER}
          strokeOpacity="0.8"
          strokeWidth="0.75"
          strokeLinecap="round"
        />
        <circle r="1.1" fill={CREAM} fillOpacity="0.95" />
        <circle r="2.2" fill={OKER} fillOpacity="0.25" />
      </g>

      {/* Field stars — anonymous background population */}
      <circle cx="36" cy="36" r="0.8" fill={INK} fillOpacity="0.4" />
      <circle cx="80" cy="26" r="0.6" fill={INK} fillOpacity="0.35" />
      <circle cx="97" cy="38" r="0.7" fill={MUTED} fillOpacity="0.5" />
      <circle cx="22" cy="52" r="0.6" fill={INK} fillOpacity="0.3" />
      <circle cx="30" cy="86" r="0.8" fill={MUTED} fillOpacity="0.5" />
      <circle cx="47" cy="94" r="0.6" fill={INK} fillOpacity="0.3" />
      <circle cx="66" cy="93" r="0.7" fill={INK} fillOpacity="0.35" />
      <circle cx="88" cy="92" r="0.6" fill={MUTED} fillOpacity="0.45" />
      <circle cx="104" cy="60" r="0.6" fill={INK} fillOpacity="0.3" />
      <circle cx="62" cy="22" r="0.7" fill={MUTED} fillOpacity="0.45" />
      {/* Two warm sparkle crosses */}
      <g stroke={OKER} strokeOpacity="0.5" strokeWidth="0.75" strokeLinecap="round">
        <path d="M18 38 L18 42 M16 40 L20 40" />
        <path d="M101 81 L101 84.6 M99.2 82.8 L102.8 82.8" />
      </g>
    </svg>
  );
}
