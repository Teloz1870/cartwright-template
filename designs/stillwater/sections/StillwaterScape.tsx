/**
 * StillwaterScape — the signature generative backdrop of the Stillwater design.
 *
 * A hand-authored, fully generative landscape (zero photos): 5 layered SVG
 * mountain ridgelines with atmospheric perspective (a per-variant opacity ramp
 * over the sky, so each nearer ridge composits darker), horizontal mist bands
 * across the ridge boundaries, a sun/moon disc with a soft radial glow, and a
 * calm water band at the foot of the foothills with hairline ripples and a
 * faint disc reflection.
 *
 * Four times of day share one geometry: `dawn`, `day` (light — ink copy sits on
 * them), `dusk`, `night` (dark — cream copy). All paint reads the cw-* palette
 * token chains (FableButterfly convention: design token → engine cw token →
 * currentColor), so the whole landscape re-tones to any shop palette via
 * applyPaletteAsTheme — no hex values live here.
 *
 * Gradient ids are stable and namespaced per variant (`sw-scape-<variant>-*`,
 * no useId): the defs are identical across instances of the same variant, so
 * duplicate ids resolve to identical paint — same precedent as FableButterfly.
 *
 * Pure server component: no client JS, no external refs, no animation (the
 * Scape is the always-painted calm baseline; motion lives in the sections).
 */
import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

export type ScapeVariant = "dawn" | "day" | "dusk" | "night";

// Palette-adaptive paint. Fallback chain: stillwater token → engine cw token → currentColor.
const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const GOLD = "var(--color-cw-gold, var(--color-cw-oker, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const SAND = "var(--color-cw-sand, var(--color-cw-stone-100, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";

/**
 * The five ridgelines, farthest → nearest. Far ridges are sharp polylines
 * (alpine peaks); the near two are soft cubic foothills. Every path closes
 * down to y=900 so each ridge fills the whole ground beneath its crest — the
 * translucent fills then stack into a natural atmospheric ramp.
 */
const RIDGES: ReadonlyArray<string> = [
  // r1 — the far range, tallest peaks on the horizon
  "M0 470 L 90 421 L 178 452 L 290 381 L 402 441 L 520 397 L 642 459 L 758 409 L 878 461 L 1000 403 L 1118 451 L 1240 415 L 1338 455 L 1440 427 L 1440 900 L 0 900 Z",
  // r2
  "M0 560 L 118 507 L 232 549 L 358 489 L 488 543 L 620 503 L 752 555 L 878 509 L 1010 551 L 1142 501 L 1268 547 L 1378 517 L 1440 539 L 1440 900 L 0 900 Z",
  // r3
  "M0 612 L 112 581 L 240 621 L 382 573 L 520 617 L 660 581 L 802 625 L 940 587 L 1078 623 L 1220 585 L 1340 619 L 1440 597 L 1440 900 L 0 900 Z",
  // r4 — first soft foothill band
  "M0 700 C 160 661, 300 711, 460 686 C 620 661, 760 715, 920 691 C 1080 667, 1240 713, 1440 684 L 1440 900 L 0 900 Z",
  // r5 — foreground hills meeting the water
  "M0 790 C 200 753, 380 799, 580 776 C 780 753, 960 801, 1160 778 C 1300 763, 1382 785, 1440 776 L 1440 900 L 0 900 Z",
];

/** Mist bands: [y, height, opacityFactor] laid across ridge boundaries. */
const MIST_BANDS: ReadonlyArray<[number, number, number]> = [
  [452, 96, 1],
  [556, 84, 0.8],
  [648, 88, 0.65],
];

/** Static night-sky stars (cx, cy, r) — only painted on the night variant. */
const STARS: ReadonlyArray<[number, number, number]> = [
  [120, 96, 1.6],
  [236, 168, 1.1],
  [338, 70, 1.4],
  [470, 140, 1.1],
  [560, 56, 1.7],
  [678, 188, 1.1],
  [780, 92, 1.4],
  [902, 150, 1.1],
  [988, 60, 1.6],
  [1244, 120, 1.4],
  [1330, 64, 1.1],
  [1402, 196, 1.3],
];

type ScapeConfig = {
  /** Sky gradient: zenith → horizon. */
  skyTop: string;
  skyHorizon: string;
  /** Sun/moon disc. Drawn before the ridges, so low discs set behind peaks. */
  disc: { cx: number; cy: number; r: number; fill: string; glowOpacity: number };
  /** One paint for all five ridges + the atmospheric-perspective opacity ramp. */
  ridgeFill: string;
  ridgeOpacities: [number, number, number, number, number];
  /** Mist tint + how present the mist is overall. */
  mistFill: string;
  mistOpacity: number;
  /** The calm water band at the bottom. */
  waterTop: string;
  waterBottom: string;
  rippleStroke: string;
  rippleOpacity: number;
  stars: boolean;
};

const SCAPES: Record<ScapeVariant, ScapeConfig> = {
  dawn: {
    skyTop: CREAM,
    skyHorizon: `color-mix(in oklab, ${GOLD} 30%, ${CREAM})`,
    disc: { cx: 1008, cy: 438, r: 60, fill: GOLD, glowOpacity: 0.5 },
    ridgeFill: ACCENT_DEEP,
    ridgeOpacities: [0.1, 0.18, 0.3, 0.45, 0.6],
    mistFill: CREAM,
    mistOpacity: 0.55,
    waterTop: `color-mix(in oklab, ${GOLD} 18%, ${CREAM})`,
    waterBottom: `color-mix(in oklab, ${ACCENT_DEEP} 34%, ${CREAM})`,
    rippleStroke: INK,
    rippleOpacity: 0.12,
    stars: false,
  },
  day: {
    skyTop: `color-mix(in oklab, ${ACCENT} 14%, ${CREAM})`,
    skyHorizon: CREAM,
    disc: { cx: 1086, cy: 148, r: 42, fill: `color-mix(in oklab, ${GOLD} 70%, ${CREAM})`, glowOpacity: 0.35 },
    ridgeFill: ACCENT,
    ridgeOpacities: [0.09, 0.15, 0.25, 0.38, 0.52],
    mistFill: CREAM,
    mistOpacity: 0.4,
    waterTop: `color-mix(in oklab, ${ACCENT} 12%, ${CREAM})`,
    waterBottom: `color-mix(in oklab, ${ACCENT} 32%, ${SAND})`,
    rippleStroke: INK,
    rippleOpacity: 0.1,
    stars: false,
  },
  dusk: {
    skyTop: `color-mix(in oklab, ${ACCENT_DEEP} 55%, ${INK})`,
    skyHorizon: `color-mix(in oklab, ${GOLD} 42%, ${ACCENT_DEEP})`,
    disc: { cx: 392, cy: 452, r: 52, fill: GOLD, glowOpacity: 0.55 },
    ridgeFill: INK,
    ridgeOpacities: [0.24, 0.36, 0.5, 0.66, 0.8],
    mistFill: CREAM,
    mistOpacity: 0.22,
    waterTop: `color-mix(in oklab, ${GOLD} 24%, ${ACCENT_DEEP})`,
    waterBottom: `color-mix(in oklab, ${INK} 62%, ${ACCENT_DEEP})`,
    rippleStroke: CREAM,
    rippleOpacity: 0.16,
    stars: false,
  },
  night: {
    skyTop: INK,
    skyHorizon: `color-mix(in oklab, ${ACCENT_DEEP} 32%, ${INK})`,
    disc: { cx: 1118, cy: 172, r: 36, fill: CREAM, glowOpacity: 0.3 },
    ridgeFill: INK,
    ridgeOpacities: [0.35, 0.5, 0.65, 0.8, 0.92],
    mistFill: CREAM,
    mistOpacity: 0.1,
    waterTop: `color-mix(in oklab, ${ACCENT_DEEP} 22%, ${INK})`,
    waterBottom: INK,
    rippleStroke: CREAM,
    rippleOpacity: 0.12,
    stars: true,
  },
};

function ScapeArt({ variant }: { variant: ScapeVariant }): ReactElement {
  const c = SCAPES[variant];
  const id = (part: string) => `sw-scape-${variant}-${part}`;

  return (
    <g>
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.skyTop} />
          <stop offset="1" stopColor={c.skyHorizon} />
        </linearGradient>
        <radialGradient id={id("glow")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={c.disc.fill} stopOpacity={c.disc.glowOpacity} />
          <stop offset="1" stopColor={c.disc.fill} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("mist")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.mistFill} stopOpacity="0" />
          <stop offset="0.5" stopColor={c.mistFill} stopOpacity="0.9" />
          <stop offset="1" stopColor={c.mistFill} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("water")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.waterTop} />
          <stop offset="1" stopColor={c.waterBottom} />
        </linearGradient>
        <linearGradient id={id("refl")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.disc.fill} stopOpacity="0.45" />
          <stop offset="1" stopColor={c.disc.fill} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect x="0" y="0" width="1440" height="900" fill={`url(#${id("sky")})`} />

      {/* Stars (night only) — static; twinkle motion belongs to StillwaterNight */}
      {c.stars
        ? STARS.map(([cx, cy, r], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill={CREAM} fillOpacity={i % 3 === 0 ? 0.85 : 0.5} />
          ))
        : null}

      {/* Sun / moon — glow first, then the disc; low discs set behind the ridges */}
      <circle
        cx={c.disc.cx}
        cy={c.disc.cy}
        r={c.disc.r * 3.1}
        fill={`url(#${id("glow")})`}
      />
      <circle cx={c.disc.cx} cy={c.disc.cy} r={c.disc.r} fill={c.disc.fill} fillOpacity="0.95" />

      {/* The five ridgelines, far → near, on the atmospheric opacity ramp */}
      {RIDGES.map((d, i) => (
        <path key={i} d={d} fill={c.ridgeFill} fillOpacity={c.ridgeOpacities[i]} />
      ))}

      {/* Mist bands across the ridge boundaries */}
      {MIST_BANDS.map(([y, h, f], i) => (
        <rect
          key={i}
          x="0"
          y={y}
          width="1440"
          height={h}
          fill={`url(#${id("mist")})`}
          opacity={c.mistOpacity * f}
        />
      ))}

      {/* Calm water — a still band at the foot of the hills */}
      <rect x="0" y="812" width="1440" height="88" fill={`url(#${id("water")})`} />
      {/* Disc reflection — a soft column fading into the depth */}
      <rect
        x={c.disc.cx - 46}
        y="812"
        width="92"
        height="64"
        fill={`url(#${id("refl")})`}
      />
      {/* Hairline ripples */}
      <g stroke={c.rippleStroke} strokeOpacity={c.rippleOpacity} strokeWidth="1" strokeLinecap="round">
        <line x1="120" y1="832" x2="560" y2="832" />
        <line x1="700" y1="848" x2="1240" y2="848" />
        <line x1="300" y1="866" x2="900" y2="866" />
        <line x1="1020" y1="878" x2="1380" y2="878" />
      </g>
    </g>
  );
}

/**
 * The reusable backdrop. Defaults to filling its positioned parent
 * (`absolute inset-0` from the caller + `h-full w-full` here); `slice` keeps
 * the horizon composition at any aspect ratio.
 */
export function StillwaterScape({
  variant = "day",
  className,
}: {
  variant?: ScapeVariant;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("h-full w-full", className)}
    >
      <ScapeArt variant={variant} />
    </svg>
  );
}

/** Whether a Scape variant carries dark ground (→ set cream copy on top). */
export function scapeIsDark(variant: ScapeVariant): boolean {
  return variant === "dusk" || variant === "night";
}
