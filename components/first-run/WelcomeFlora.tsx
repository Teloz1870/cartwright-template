/**
 * Glassmorphic floating ornaments behind the welcome hero — glass butterflies
 * (real butterfly silhouette, rendered as frosted glass with flapping wings),
 * frosted blossoms, bubbles and a slow-turning glass cube.
 *
 * The butterflies are SVG: a true butterfly path (large forewings + smaller
 * hindwings + body + antennae) filled with a translucent purple/blue glass
 * gradient, a luminous white edge, specular wing highlights and a soft drop
 * shadow — so they read as real butterflies made of glass. Wings flap via
 * scaleX around the body. Blossoms/bubbles/cube are CSS divs using real
 * `backdrop-filter` frost.
 *
 * Pure CSS keyframes (server-rendered <style>), all motion wrapped in
 * `@media (prefers-reduced-motion: no-preference)`. `pointer-events-none` +
 * `aria-hidden` — purely ornamental, never in the a11y tree or click path.
 */

/** Real butterfly silhouette in a 100×90 viewBox, split into flapping wings. */
function GlassButterfly({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 100 90" className={`cw-bfly-svg ${className}`} style={style} aria-hidden>
      {/* left forewing + hindwing — flap together around the body */}
      <g className="cw-bwing cw-bwing-l">
        <path className="cw-bglass" d="M50 33 C46 16 33 6 21 9 C8 12 4 26 10 37 C14 45 27 48 39 43 C46 40 49 38 50 34 Z" />
        <path className="cw-bglass" d="M50 47 C45 47 33 51 27 63 C22 73 29 83 39 79 C47 76 50 62 50 53 Z" />
        {/* inner cell shading for glass depth */}
        <path className="cw-bcell" d="M48 35 C41 28 31 19 25 13 C16 16 11 24 13 32 C22 35 35 37 48 36 Z" />
        {/* forewing veins radiating from the body root */}
        <path className="cw-bvein" d="M49 35 C41 27 31 17 24 11 M49 37 C37 34 19 31 9 31 M49 38 C37 39 25 41 14 42" />
        {/* hindwing veins */}
        <path className="cw-bvein" d="M50 51 C43 55 33 61 28 66 M50 53 C43 60 36 70 36 77" />
        {/* edge spots */}
        <circle className="cw-bspot" cx="12" cy="19" r="1.3" />
        <circle className="cw-bspot" cx="8" cy="29" r="1.3" />
        <circle className="cw-bspot" cx="15" cy="37" r="1.2" />
        <circle className="cw-bspot" cx="27" cy="67" r="1.2" />
        <circle className="cw-bspot" cx="34" cy="78" r="1.1" />
        <ellipse className="cw-bglint" cx="24" cy="24" rx="6" ry="3.8" transform="rotate(-22 24 24)" />
      </g>
      {/* right forewing + hindwing */}
      <g className="cw-bwing cw-bwing-r">
        <path className="cw-bglass" d="M50 33 C54 16 67 6 79 9 C92 12 96 26 90 37 C86 45 73 48 61 43 C54 40 51 38 50 34 Z" />
        <path className="cw-bglass" d="M50 47 C55 47 67 51 73 63 C78 73 71 83 61 79 C53 76 50 62 50 53 Z" />
        <path className="cw-bcell" d="M52 35 C59 28 69 19 75 13 C84 16 89 24 87 32 C78 35 65 37 52 36 Z" />
        <path className="cw-bvein" d="M51 35 C59 27 69 17 76 11 M51 37 C63 34 81 31 91 31 M51 38 C63 39 75 41 86 42" />
        <path className="cw-bvein" d="M50 51 C57 55 67 61 72 66 M50 53 C57 60 64 70 64 77" />
        <circle className="cw-bspot" cx="88" cy="19" r="1.3" />
        <circle className="cw-bspot" cx="92" cy="29" r="1.3" />
        <circle className="cw-bspot" cx="85" cy="37" r="1.2" />
        <circle className="cw-bspot" cx="73" cy="67" r="1.2" />
        <circle className="cw-bspot" cx="66" cy="78" r="1.1" />
        <ellipse className="cw-bglint" cx="76" cy="24" rx="6" ry="3.8" transform="rotate(22 76 24)" />
      </g>
      {/* antennae + body sit above the wings */}
      <path className="cw-bant" d="M50 29 C47 18 42 11 36 7 M50 29 C53 18 58 11 64 7" />
      <circle className="cw-btip" cx="36" cy="6.5" r="1.7" />
      <circle className="cw-btip" cx="64" cy="6.5" r="1.7" />
      <path className="cw-bbody" d="M50 27 C52.2 27 54 29 54 31.6 L54 76 C54 78.8 52.2 81 50 81 C47.8 81 46 78.8 46 76 L46 31.6 C46 29 47.8 27 50 27 Z" />
      <path className="cw-bseg" d="M47.2 39 H52.8 M47 47 H53 M47 55 H53 M47 63 H53 M47.2 71 H52.8" />
    </svg>
  );
}

export function WelcomeFlora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Shared glass gradients/filters — referenced by every butterfly SVG. */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="cwBflyGlass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
            <stop offset="42%" stopColor="rgba(196,170,255,0.18)" />
            <stop offset="100%" stopColor="rgba(140,196,255,0.24)" />
          </linearGradient>
        </defs>
      </svg>

      <style>{`
        .cw-fl { position: absolute; will-change: transform; }

        /* ── Glass butterflies ───────────────────────────────────────────── */
        .cw-bfly-svg { width: var(--s,72px); height: calc(var(--s,72px) * 0.9); overflow: visible;
          filter: drop-shadow(0 8px 10px rgba(86,64,160,0.30)); }
        .cw-bglass { fill: url(#cwBflyGlass); stroke: rgba(255,255,255,0.6); stroke-width: 1.2;
          vector-effect: non-scaling-stroke; stroke-linejoin: round; }
        .cw-bglint { fill: rgba(255,255,255,0.45); }
        .cw-bcell { fill: rgba(255,255,255,0.16); }
        .cw-bvein { fill: none; stroke: rgba(255,255,255,0.42); stroke-width: 0.7; vector-effect: non-scaling-stroke; stroke-linecap: round; }
        .cw-bspot { fill: rgba(255,255,255,0.6); }
        .cw-bseg  { stroke: rgba(255,255,255,0.42); stroke-width: 0.7; vector-effect: non-scaling-stroke; stroke-linecap: round; }
        .cw-bbody { fill: rgba(78,60,140,0.62); stroke: rgba(255,255,255,0.5); stroke-width: 0.8; vector-effect: non-scaling-stroke; }
        .cw-bant  { fill: none; stroke: rgba(78,60,140,0.55); stroke-width: 1.4; vector-effect: non-scaling-stroke; stroke-linecap: round; }
        .cw-btip  { fill: rgba(124,92,255,0.7); }
        .cw-bwing { transform-box: fill-box; }
        .cw-bwing-l { transform-origin: 100% 50%; }
        .cw-bwing-r { transform-origin: 0% 50%; }

        /* Shared frosted-glass surface for the non-butterfly ornaments. */
        .cw-g {
          background:
            linear-gradient(135deg,
              rgba(255,255,255,0.42) 0%,
              rgba(244,170,255,0.12) 26%,
              rgba(168,150,255,0.13) 58%,
              rgba(130,198,255,0.19) 100%);
          -webkit-backdrop-filter: blur(5px) saturate(150%);
          backdrop-filter: blur(5px) saturate(150%);
          border: 1px solid rgba(255,255,255,0.45);
          box-shadow:
            0 12px 26px -12px rgba(86,64,160,0.28),
            inset 0 1px 2px rgba(255,255,255,0.7),
            inset 0 -8px 14px -8px rgba(124,92,255,0.22);
        }

        /* ── Blossom ─────────────────────────────────────────────────────── */
        .cw-flower { width: var(--s,42px); height: var(--s,42px); position: relative; }
        .cw-flower .petal {
          position:absolute; left:50%; top:50%; width:38%; height:54%;
          margin:-27% 0 0 -19%; border-radius:50% 50% 50% 50% / 64% 64% 36% 36%;
          transform-origin:50% 84%;
        }
        .cw-flower .core {
          position:absolute; left:50%; top:50%; width:30%; height:30%;
          margin:-15% 0 0 -15%; border-radius:50%;
          background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9), rgba(251,231,166,0.55) 60%, rgba(124,92,255,0.25));
          border:1px solid rgba(255,255,255,0.6);
        }

        /* ── Bubble + cube ───────────────────────────────────────────────── */
        .cw-bubble { width: var(--s,30px); height: var(--s,30px); border-radius:50%; position: relative; }
        .cw-cube   { width: var(--s,46px); height: var(--s,46px); border-radius:26%; position: relative; }
        .cw-bubble::after, .cw-cube::after {
          content:""; position:absolute; left:18%; top:12%; width:34%; height:26%;
          border-radius:50%; background: rgba(255,255,255,0.75); filter: blur(2.5px);
        }

        @media (prefers-reduced-motion: no-preference) {
          @keyframes cw-drift-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(24px,-30px)} }
          @keyframes cw-drift-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-22px,-20px)} }
          @keyframes cw-drift-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(16px,22px)} }
          @keyframes cw-drift-d { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-14px,18px)} }
          @keyframes cw-flap-l { from{transform:scaleX(1)} to{transform:scaleX(0.74)} }
          @keyframes cw-flap-r { from{transform:scaleX(1)} to{transform:scaleX(0.74)} }
          @keyframes cw-sway    { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
          @keyframes cw-turn    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes cw-bob     { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-16px) rotate(8deg)} }
          .cw-anim-drift { animation: var(--drift) ease-in-out infinite; }
          .cw-bwing-l { animation: cw-flap-l var(--flap,1.1s) ease-in-out infinite alternate; }
          .cw-bwing-r { animation: cw-flap-r var(--flap,1.1s) ease-in-out infinite alternate; }
          .cw-flower { animation: cw-sway var(--sway,7s) ease-in-out infinite; }
          .cw-cube   { animation: cw-turn var(--turn,16s) linear infinite; }
          .cw-bubble { animation: cw-bob var(--bob,9s) ease-in-out infinite; }
        }
      `}</style>

      {/* Butterflies — outer wrapper drifts, wings flap. */}
      <div className="cw-fl cw-anim-drift left-[8%] top-[22%]" style={{ ["--drift" as string]: "cw-drift-a 13s" }}>
        <GlassButterfly style={{ ["--s" as string]: "56px", ["--flap" as string]: "1.15s" } as React.CSSProperties} />
      </div>
      <div className="cw-fl cw-anim-drift right-[10%] top-[16%]" style={{ ["--drift" as string]: "cw-drift-b 15s" }}>
        <GlassButterfly style={{ ["--s" as string]: "44px", ["--flap" as string]: "0.95s" } as React.CSSProperties} />
      </div>
      <div className="cw-fl cw-anim-drift right-[27%] top-[54%]" style={{ ["--drift" as string]: "cw-drift-c 17s" }}>
        <GlassButterfly style={{ ["--s" as string]: "34px", ["--flap" as string]: "1.3s" } as React.CSSProperties} />
      </div>

      {/* Blossoms */}
      <div className="cw-fl cw-anim-drift left-[17%] top-[60%]" style={{ ["--drift" as string]: "cw-drift-d 16s" }}>
        <div className="cw-flower" style={{ ["--s" as string]: "40px", ["--sway" as string]: "8s" }}>
          {[0, 72, 144, 216, 288].map((d) => (
            <span key={d} className="cw-g petal" style={{ transform: `rotate(${d}deg)` }} />
          ))}
          <span className="core" />
        </div>
      </div>
      <div className="cw-fl cw-anim-drift right-[7%] top-[66%]" style={{ ["--drift" as string]: "cw-drift-a 19s" }}>
        <div className="cw-flower" style={{ ["--s" as string]: "30px", ["--sway" as string]: "6.5s" }}>
          {[0, 72, 144, 216, 288].map((d) => (
            <span key={d} className="cw-g petal" style={{ transform: `rotate(${d}deg)` }} />
          ))}
          <span className="core" />
        </div>
      </div>

      {/* Glass cube + bubbles */}
      <div className="cw-fl cw-anim-drift left-[6%] top-[46%]" style={{ ["--drift" as string]: "cw-drift-b 21s" }}>
        <div className="cw-g cw-cube" style={{ ["--s" as string]: "44px", ["--turn" as string]: "20s" }} />
      </div>
      <span className="cw-fl cw-g cw-bubble left-[80%] top-[30%]" style={{ ["--s" as string]: "34px", ["--bob" as string]: "9s" }} />
      <span className="cw-fl cw-g cw-bubble left-[30%] top-[16%]" style={{ ["--s" as string]: "20px", ["--bob" as string]: "11s" }} />
      <span className="cw-fl cw-g cw-bubble right-[18%] top-[78%]" style={{ ["--s" as string]: "26px", ["--bob" as string]: "8s" }} />
    </div>
  );
}
