/**
 * EMBER motif — hand-authored glowing ember/spark graphics (server-rendered
 * inline SVG), in the FableButterfly house style.
 *
 * Three variants share one component: a compact glowing spark mark (`spark`),
 * a fuller flame-petal bloom (`bloom`) and a rising ember with a drifting
 * trail (`trail`). All color is read from the cw-* palette tokens so the art
 * adapts to whichever palette the shop runs — no hex values live here.
 * Gradient ids are stable and namespaced per variant (`ember-sp-*`; no useId —
 * the defs are identical across instances, so duplicate ids resolve to
 * identical paint).
 *
 * ORIGINAL artwork: a concentric warm core with radiating spark filaments —
 * deliberately NOT a heart, flame-logo or any trademark-adjacent shape.
 *
 * Pure server component: no client JS, no external refs.
 */
import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

// Palette-adaptive paint. Fallback chain: ember token → engine cw token → currentColor.
const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const SAND = "var(--color-cw-sand, var(--color-cw-stone-100, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/* ── Shared core ────────────────────────────────────────────────────────────
 * The concentric ember heart every variant builds on: a soft halo, a warm
 * gradient bloom and a hot cream center with a tiny off-center glint. */
function CoreDefs(): ReactElement {
  return (
    <defs>
      {/* Outer halo — accent fading to nothing */}
      <radialGradient id="ember-sp-halo">
        <stop offset="0" stopColor={ACCENT} stopOpacity="0.32" />
        <stop offset="0.55" stopColor={ACCENT} stopOpacity="0.12" />
        <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
      </radialGradient>
      {/* Core bloom — hot cream center → accent → deep rim */}
      <radialGradient id="ember-sp-core">
        <stop offset="0" stopColor={CREAM} />
        <stop offset="0.38" stopColor={ACCENT} stopOpacity="0.92" />
        <stop offset="1" stopColor={ACCENT_DEEP} />
      </radialGradient>
      {/* Flame petal — accent body fading toward the tip */}
      <linearGradient id="ember-sp-petal" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor={ACCENT_DEEP} />
        <stop offset="0.55" stopColor={ACCENT} stopOpacity="0.75" />
        <stop offset="1" stopColor={ACCENT} stopOpacity="0.12" />
      </linearGradient>
    </defs>
  );
}

function EmberCore({
  cx,
  cy,
  scale = 1,
}: {
  cx: number;
  cy: number;
  scale?: number;
}): ReactElement {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <circle r="30" fill="url(#ember-sp-halo)" />
      <circle r="13" fill="url(#ember-sp-core)" />
      {/* Hot center + glint, slightly off-axis so the core reads hand-lit */}
      <circle r="5.2" fill={CREAM} fillOpacity="0.95" />
      <circle cx="-1.6" cy="-1.8" r="1.4" fill={CREAM} />
      {/* Deep rim line grounds the bloom against light backgrounds */}
      <circle r="13" fill="none" stroke={ACCENT_DEEP} strokeOpacity="0.35" strokeWidth="0.8" />
    </g>
  );
}

/* ── Spark — the compact mark (header, footer, dividers) ───────────────────
 * Eight radiating filaments of uneven length curve gently clockwise so the
 * mark feels alive rather than geometric; each carries a tip mote. */
function SparkArt(): ReactElement {
  return (
    <g>
      <CoreDefs />
      <EmberCore cx={60} cy={60} />
      {/* Long primary filaments (N / E / S / W) */}
      <g stroke={ACCENT} strokeWidth="1.8" fill="none" strokeLinecap="round">
        <path d="M60 43 C 61.5 35, 59.5 27, 61 19" strokeOpacity="0.85" />
        <path d="M77 60 C 84 59, 91 60.5, 99 58.5" strokeOpacity="0.8" />
        <path d="M60 77 C 58.5 84, 60.5 91, 59 99" strokeOpacity="0.75" />
        <path d="M43 60 C 36 61, 29 59.5, 21 61.5" strokeOpacity="0.7" />
      </g>
      {/* Shorter diagonal filaments, deeper toned */}
      <g stroke={ACCENT_DEEP} strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M72 48 C 77 43, 82 38.5, 87.5 33.5" strokeOpacity="0.7" />
        <path d="M71.5 71.5 C 76 76.5, 80 81, 84.5 86.5" strokeOpacity="0.6" />
        <path d="M48 71.5 C 43.5 76, 39.5 80, 35 84.5" strokeOpacity="0.55" />
        <path d="M48.5 48.5 C 44 44, 40 40.5, 35.5 36" strokeOpacity="0.65" />
      </g>
      {/* Tip motes — brighter on the longer filaments */}
      <g fill={ACCENT}>
        <circle cx="61.3" cy="16.6" r="1.5" fillOpacity="0.9" />
        <circle cx="101.2" cy="58" r="1.4" fillOpacity="0.85" />
        <circle cx="58.8" cy="101.2" r="1.3" fillOpacity="0.8" />
        <circle cx="18.8" cy="62" r="1.2" fillOpacity="0.75" />
      </g>
      <g fill={ACCENT_DEEP}>
        <circle cx="89.2" cy="32" r="1.1" fillOpacity="0.8" />
        <circle cx="86" cy="88.2" r="1" fillOpacity="0.7" />
        <circle cx="33.6" cy="86" r="0.9" fillOpacity="0.65" />
        <circle cx="34" cy="34.5" r="1" fillOpacity="0.75" />
      </g>
      {/* Floating motes drifting between the filaments */}
      <circle cx="79" cy="41" r="1" fill={ACCENT} fillOpacity="0.45" />
      <circle cx="41" cy="78" r="0.9" fill={ACCENT} fillOpacity="0.4" />
      <circle cx="82" cy="74" r="0.8" fill={MUTED} fillOpacity="0.5" />
      <circle cx="42.5" cy="40" r="0.8" fill={MUTED} fillOpacity="0.45" />
    </g>
  );
}

/* ── Bloom — the fuller mark (cards, feature icons) ─────────────────────────
 * Six soft flame petals around the core, with short between-petal filaments
 * and a sparse outer ring of motes — an ember opening into bloom. */

/** One petal pointing up; the other five are this group rotated about (60,60). */
function PetalUp(): ReactElement {
  return (
    <path
      d="M60 45 C 54.5 37.5, 54 27, 60 17.5 C 66 27, 65.5 37.5, 60 45 Z"
      fill="url(#ember-sp-petal)"
      stroke={ACCENT_DEEP}
      strokeOpacity="0.3"
      strokeWidth="0.7"
    />
  );
}

function BloomArt(): ReactElement {
  const petalAngles = [0, 60, 120, 180, 240, 300];
  const filamentAngles = [30, 90, 150, 210, 270, 330];
  return (
    <g>
      <CoreDefs />
      {/* Wide soft halo behind everything */}
      <circle cx="60" cy="60" r="46" fill="url(#ember-sp-halo)" opacity="0.8" />
      {/* Petals */}
      {petalAngles.map((a) => (
        <g key={a} transform={`rotate(${a} 60 60)`}>
          <PetalUp />
        </g>
      ))}
      {/* Short filaments between the petals */}
      {filamentAngles.map((a) => (
        <g key={a} transform={`rotate(${a} 60 60)`}>
          <path
            d="M60 40 C 60.8 35.5, 59.6 31, 60.4 26.5"
            fill="none"
            stroke={ACCENT_DEEP}
            strokeOpacity="0.55"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="60.4" cy="24.8" r="1" fill={ACCENT_DEEP} fillOpacity="0.7" />
        </g>
      ))}
      {/* Sparse outer mote ring — hand-placed, not perfectly even */}
      <g fill={ACCENT}>
        <circle cx="93" cy="38" r="1.2" fillOpacity="0.6" />
        <circle cx="104" cy="66" r="0.9" fillOpacity="0.5" />
        <circle cx="80" cy="98" r="1.1" fillOpacity="0.55" />
        <circle cx="29" cy="93" r="0.9" fillOpacity="0.5" />
        <circle cx="16" cy="55" r="1" fillOpacity="0.55" />
        <circle cx="35" cy="22" r="1.1" fillOpacity="0.6" />
      </g>
      <EmberCore cx={60} cy={60} scale={1.12} />
    </g>
  );
}

/* ── Trail — a rising ember (hero ornament) ─────────────────────────────────
 * A small ember climbs toward the top-right, leaving a curved, fading trail
 * of motes — drawn tail-first so the head overlaps forward. */
function TrailArt(): ReactElement {
  return (
    <g>
      <CoreDefs />
      {/* Soft wide wake under the trail */}
      <path
        d="M20 100 C 38 90, 44 72, 53 59 C 61 48, 68 41, 75 34"
        fill="none"
        stroke={ACCENT}
        strokeOpacity="0.14"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* The trail line itself */}
      <path
        d="M20 100 C 38 90, 44 72, 53 59 C 61 48, 68 41, 75 34"
        fill="none"
        stroke={ACCENT}
        strokeOpacity="0.5"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Fading motes along the climb — bigger and dimmer toward the tail */}
      <circle cx="26" cy="95.5" r="2.6" fill={ACCENT_DEEP} fillOpacity="0.22" />
      <circle cx="36" cy="84" r="2.2" fill={ACCENT_DEEP} fillOpacity="0.32" />
      <circle cx="45" cy="70" r="1.9" fill={ACCENT} fillOpacity="0.42" />
      <circle cx="54" cy="57.5" r="1.6" fill={ACCENT} fillOpacity="0.55" />
      <circle cx="63" cy="46.5" r="1.3" fill={ACCENT} fillOpacity="0.7" />
      <circle cx="70" cy="39" r="1.1" fill={ACCENT} fillOpacity="0.85" />
      {/* Side-sparks shed near the head */}
      <g stroke={ACCENT_DEEP} strokeWidth="1" fill="none" strokeLinecap="round">
        <path d="M70 28 C 72 24.5, 74.5 21.5, 77.5 19" strokeOpacity="0.55" />
        <path d="M88 36 C 91.5 35, 95 34.6, 98.5 35" strokeOpacity="0.5" />
        <path d="M85 19.5 C 87.5 17, 90.5 15, 94 13.5" strokeOpacity="0.45" />
      </g>
      <circle cx="78.6" cy="18" r="0.9" fill={ACCENT_DEEP} fillOpacity="0.7" />
      <circle cx="100" cy="35.1" r="0.9" fill={ACCENT_DEEP} fillOpacity="0.6" />
      <circle cx="95.2" cy="13" r="0.8" fill={ACCENT_DEEP} fillOpacity="0.55" />
      {/* Faint sand undertone so the head sits on dark AND light grounds */}
      <circle cx="80" cy="28" r="15" fill={SAND} fillOpacity="0.12" />
      {/* The rising ember head */}
      <EmberCore cx={80} cy={28} scale={0.62} />
      {/* A grounding ink mote where the trail began */}
      <circle cx="20" cy="100" r="1.2" fill={INK} fillOpacity="0.3" />
    </g>
  );
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export function EmberSpark({
  variant = "spark",
  className,
}: {
  variant?: "spark" | "bloom" | "trail";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {variant === "bloom" ? <BloomArt /> : variant === "trail" ? <TrailArt /> : <SparkArt />}
    </svg>
  );
}

/**
 * Section divider — a hairline rule with three small sparks glowing on it
 * (the same hand-authored spark mark, scaled down). Purely decorative.
 */
export function EmberDivider({ className }: { className?: string }) {
  const hairline = {
    background: "color-mix(in oklab, var(--color-cw-ink, currentColor) 20%, transparent)",
  } as const;
  return (
    <div className={cn("flex items-center gap-4", className)} aria-hidden="true">
      <span className="h-px flex-1" style={hairline} />
      <span className="flex items-center gap-3">
        <EmberSpark className="size-3.5 opacity-60" />
        <EmberSpark className="size-5" />
        <EmberSpark className="size-3.5 opacity-60" />
      </span>
      <span className="h-px flex-1" style={hairline} />
    </div>
  );
}
