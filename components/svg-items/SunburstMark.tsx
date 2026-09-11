import type { CSSProperties } from "react";
/**
 * SunburstMark — a radiant sun with alternating long and short rays.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * Sixteen rays alternate in length and weight around a gradient disc; a
 * dotted inter-ray ring and a faint halo complete the engraving feel. All
 * paint reads the cw-* palette tokens with the engine fallback chain.
 *
 * Opt-in hover motion: render inside an element carrying the `cwsi-animate`
 * class and the sun wakes on hover (the ray crown turns slowly, the disc
 * breathes, the tip jewels glint). Without that class — or under reduced
 * motion — nothing ever moves.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */

/** Hover-only motion, gated on both `.cwsi-animate` and reduced-motion. */
const SUN_HOVER_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-animate:hover .cwsi-sun-hov-rays {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-sun-hovturn 26s linear infinite;
  }
  .cwsi-animate:hover .cwsi-sun-hov-disc {
    transform-box: fill-box;
    transform-origin: center;
    animation: cwsi-sun-hovbreathe 4.2s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-sun-hov-jewel {
    animation: cwsi-sun-hovglint 4.2s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-sun-hov-jewel2 { animation-delay: -2.1s; }
  @keyframes cwsi-sun-hovturn {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes cwsi-sun-hovbreathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.03); }
  }
  @keyframes cwsi-sun-hovglint {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
}
`;

const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const OKER = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const OKER_DEEP =
  "var(--color-cw-gold-deep, var(--color-cw-oker-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 16 rays at 22.5° steps — even indices long, odd indices short. */
const RAYS = Array.from({ length: 16 }, (_, i) => {
  const a = (i * Math.PI) / 8 - Math.PI / 2;
  const long = i % 2 === 0;
  const from = long ? 22 : 21;
  const to = long ? 47 : 33.5;
  return {
    long,
    x1: r2(60 + from * Math.cos(a)),
    y1: r2(60 + from * Math.sin(a)),
    x2: r2(60 + to * Math.cos(a)),
    y2: r2(60 + to * Math.sin(a)),
    // Tip jewels sit just beyond every second long ray (the cardinal ones).
    tx: r2(60 + 51 * Math.cos(a)),
    ty: r2(60 + 51 * Math.sin(a)),
  };
});

/** Quiet dots resting between the rays. */
const BETWEEN_DOTS = Array.from({ length: 16 }, (_, i) => {
  const a = (i * Math.PI) / 8 - Math.PI / 2 + Math.PI / 16;
  return { x: r2(60 + 27.5 * Math.cos(a)), y: r2(60 + 27.5 * Math.sin(a)) };
});

export function SunburstMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className} style={style}
    >
      <defs>
        <radialGradient id="cwsi-sun-disc" cx="0.36" cy="0.32" r="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.45" stopColor={OKER} />
          <stop offset="1" stopColor={OKER_DEEP} />
        </radialGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: SUN_HOVER_CSS }} />

      {/* Halo washes + outermost faint ring */}
      <circle cx="60" cy="60" r="24" fill={OKER} fillOpacity="0.08" />
      <circle cx="60" cy="60" r="18.5" fill={OKER} fillOpacity="0.08" />
      <circle cx="60" cy="60" r="54" fill="none" stroke={OKER} strokeOpacity="0.14" strokeWidth="0.75" />

      {/* Rays — long rays heavier and deeper, short rays lighter */}
      <g className="cwsi-sun-hov-rays" strokeLinecap="round" fill="none">
        {RAYS.map((ray, i) => (
          <path
            key={i}
            d={`M${ray.x1} ${ray.y1} L${ray.x2} ${ray.y2}`}
            stroke={ray.long ? OKER_DEEP : OKER}
            strokeWidth={ray.long ? 1.5 : 1}
            strokeOpacity={ray.long ? 0.75 : 0.55}
          />
        ))}
      </g>
      {/* Cardinal tip jewels (every fourth ray) */}
      {RAYS.filter((_, i) => i % 4 === 0).map((ray, i) => (
        <circle
          key={i}
          className={`cwsi-sun-hov-jewel${i % 2 === 1 ? " cwsi-sun-hov-jewel2" : ""}`}
          cx={ray.tx}
          cy={ray.ty}
          r="1.1"
          fill={ACCENT}
          fillOpacity="0.8"
        />
      ))}
      {/* Dotted ring resting between the rays */}
      {BETWEEN_DOTS.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="0.7" fill={ACCENT_DEEP} fillOpacity="0.35" />
      ))}

      {/* The disc — gradient body, fine rim, inner ring, crescent highlight */}
      <circle
        className="cwsi-sun-hov-disc"
        cx="60"
        cy="60"
        r="15.5"
        fill="url(#cwsi-sun-disc)"
        stroke={OKER_DEEP}
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      <circle cx="60" cy="60" r="11.5" fill="none" stroke={CREAM} strokeOpacity="0.4" strokeWidth="0.75" />
      <path
        d="M50.5 55 C 51.5 50, 55 46.5, 59.5 45.8"
        fill="none"
        stroke={CREAM}
        strokeOpacity="0.65"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Face of the disc — three engraved freckles + a core dot */}
      <circle cx="64.5" cy="63.5" r="1" fill={OKER_DEEP} fillOpacity="0.5" />
      <circle cx="57" cy="66" r="0.8" fill={OKER_DEEP} fillOpacity="0.4" />
      <circle cx="65" cy="56.5" r="0.7" fill={OKER_DEEP} fillOpacity="0.35" />
      <circle cx="60" cy="60" r="1.6" fill={ACCENT_DEEP} fillOpacity="0.35" />

      {/* Corner companions — small sparks acknowledging the light */}
      <g stroke={INK} strokeOpacity="0.35" strokeWidth="0.75" strokeLinecap="round">
        <path d="M19 21 L19 25 M17 23 L21 23" />
        <path d="M102 96 L102 99.4 M100.3 97.7 L103.7 97.7" />
      </g>
      <circle cx="100" cy="22" r="0.8" fill={ACCENT} fillOpacity="0.5" />
      <circle cx="20" cy="98" r="0.8" fill={OKER} fillOpacity="0.55" />
    </svg>
  );
}
