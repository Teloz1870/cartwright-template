/**
 * FABLE motif — hand-authored metamorphosis graphics (server-rendered inline SVG).
 *
 * Three hero-grade variants share one component: a morpho seen from above
 * (`butterfly`), a hanging chrysalis (`chrysalis`) and a segmented larva
 * (`caterpillar`). All color is read from the cw-* palette tokens so the art
 * adapts to whichever palette the shop runs — no hex values live here.
 * Gradient ids are stable and namespaced per variant (no useId — the defs are
 * identical across instances, so duplicate ids resolve to identical paint).
 *
 * Pure server component: no client JS, no external refs.
 */
import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

// Palette-adaptive paint. Fallback chain: fable token → engine cw token → currentColor.
const ACCENT = "var(--color-cw-accent, var(--color-cw-terracotta, currentColor))";
const ACCENT_DEEP =
  "var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))";
const CREAM = "var(--color-cw-cream, var(--color-cw-paper, currentColor))";
const SAND = "var(--color-cw-sand, var(--color-cw-stone-100, currentColor))";
const INK = "var(--color-cw-ink, currentColor)";
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/* ── Butterfly ──────────────────────────────────────────────────────────── */

/** One wing pair (left side); the right side is this group mirrored around x=60. */
function WingSide(): ReactElement {
  return (
    <g>
      {/* Forewing — large upper lobe sweeping toward the top corner */}
      <path
        d="M56 46 C 48 33, 33 21, 19 19.5 C 9 18.4, 3.5 26, 5.8 36 C 8.4 47.5, 21 56.5, 37 59.5 C 47 61.3, 54.4 55.6, 56 46 Z"
        fill="url(#fable-bf-fore)"
        stroke={ACCENT_DEEP}
        strokeWidth="1"
        strokeOpacity="0.55"
      />
      {/* Hindwing — smaller rounded lower lobe */}
      <path
        d="M55.4 57 C 46 57.6, 35 62.5, 29.6 71.5 C 25.4 79.6, 29.4 90, 38.6 93 C 47 95.6, 54.6 90.4, 56.8 80.5 C 58.2 73.5, 57.2 63.6, 55.4 57 Z"
        fill="url(#fable-bf-hind)"
        stroke={ACCENT_DEEP}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      {/* Forewing veins — radiating from the wing base */}
      <g stroke={INK} strokeOpacity="0.28" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M54.5 46.5 C 45 38, 33 27.5, 21.5 22.5" />
        <path d="M54.5 48.5 C 43 42.5, 28 36, 13 33.5" />
        <path d="M54 51 C 43 49.5, 30 48.5, 17 45.5" />
        <path d="M54 53 C 44.5 55, 34 56.6, 25 57" />
        {/* Cross-veins — the cell pattern near the margin */}
        <path d="M20 25 Q 15.6 32.5 14.6 40" />
        <path d="M30 30.5 Q 26 39 26 47.5" />
        <path d="M41 38 Q 38.4 45.5 39 52.6" />
      </g>
      {/* Hindwing veins */}
      <g stroke={INK} strokeOpacity="0.26" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M55 60 C 47.5 61.5, 39.6 65.5, 33.6 71.5" />
        <path d="M55.8 64.5 C 49 68, 42.4 74, 38 81.5" />
        <path d="M56.4 70 C 51.6 75, 47 81.6, 44.4 88.6" />
        <path d="M34 76 Q 38 81 40.6 86.6" />
      </g>
      {/* Cream sheen along the leading edge of the forewing */}
      <path
        d="M49 41 C 41 32.5, 31.5 25.5, 22 22.5"
        fill="none"
        stroke={CREAM}
        strokeWidth="3"
        strokeOpacity="0.3"
        strokeLinecap="round"
      />
      {/* Softer sheen across the hindwing */}
      <path
        d="M50 64 C 43 67, 37 72.5, 33.5 79"
        fill="none"
        stroke={CREAM}
        strokeWidth="2.4"
        strokeOpacity="0.22"
        strokeLinecap="round"
      />
      {/* Forewing eyespot */}
      <circle cx="20.5" cy="28.5" r="2.3" fill={CREAM} fillOpacity="0.8" />
      <circle cx="20.5" cy="28.5" r="1" fill={ACCENT_DEEP} fillOpacity="0.9" />
      {/* Hindwing eyespot — ringed, with a cream glint */}
      <circle cx="39.5" cy="79" r="3.4" fill={CREAM} fillOpacity="0.85" />
      <circle cx="39.5" cy="79" r="1.7" fill={ACCENT_DEEP} />
      <circle cx="38.6" cy="78" r="0.6" fill={CREAM} fillOpacity="0.9" />
    </g>
  );
}

function ButterflyArt(): ReactElement {
  return (
    <g>
      <defs>
        <linearGradient id="fable-bf-fore" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={ACCENT} />
          <stop offset="0.55" stopColor={ACCENT} stopOpacity="0.85" />
          <stop offset="1" stopColor={ACCENT_DEEP} />
        </linearGradient>
        <linearGradient id="fable-bf-hind" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={ACCENT_DEEP} />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Left wings + mirrored right wings */}
      <WingSide />
      <g transform="matrix(-1 0 0 1 120 0)">
        <WingSide />
      </g>
      {/* Antennae — fine clubbed curves */}
      <g stroke={INK} strokeWidth="1" strokeOpacity="0.85" fill="none" strokeLinecap="round">
        <path d="M58.6 37 C 55 30, 51 24, 46 19.5" />
        <path d="M61.4 37 C 65 30, 69 24, 74 19.5" />
      </g>
      <circle cx="45.6" cy="19" r="1.2" fill={INK} fillOpacity="0.85" />
      <circle cx="74.4" cy="19" r="1.2" fill={INK} fillOpacity="0.85" />
      {/* Body — head, thorax, tapering abdomen */}
      <circle cx="60" cy="39.5" r="3" fill={INK} fillOpacity="0.92" />
      <ellipse cx="60" cy="49" rx="3.4" ry="6.5" fill={INK} fillOpacity="0.92" />
      <path
        d="M60 56 C 63 62, 63.5 74, 60 90 C 56.5 74, 57 62, 60 56 Z"
        fill={INK}
        fillOpacity="0.88"
      />
      {/* Abdomen segment ticks */}
      <g stroke={CREAM} strokeOpacity="0.35" strokeWidth="0.75" strokeLinecap="round">
        <path d="M57.9 64 L62.1 64" />
        <path d="M58 70 L62 70" />
        <path d="M58.3 76 L61.7 76" />
        <path d="M58.8 82 L61.2 82" />
      </g>
      {/* Thorax highlight */}
      <path
        d="M58.6 44 C 58 47, 58 51, 58.6 54"
        fill="none"
        stroke={CREAM}
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </g>
  );
}

/* ── Chrysalis ──────────────────────────────────────────────────────────── */

function ChrysalisArt(): ReactElement {
  return (
    <g>
      <defs>
        <linearGradient id="fable-ch-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.45" stopColor={SAND} />
          <stop offset="1" stopColor={SAND} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {/* Branch the chrysalis hangs from, plus a small twig and leaf */}
      <path
        d="M6 16 C 34 10, 72 18, 114 12"
        fill="none"
        stroke={INK}
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M84 14.6 C 92 18, 97 24, 99 30"
        fill="none"
        stroke={INK}
        strokeOpacity="0.35"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M99 30 C 104 28, 108 30, 110 35 C 105 37, 100 35, 99 30 Z"
        fill={ACCENT}
        fillOpacity="0.18"
        stroke={ACCENT}
        strokeOpacity="0.4"
        strokeWidth="0.75"
      />
      {/* Silk pad, thread, and cremaster knob */}
      <path d="M57 14.6 L63 14.8 L60 19.5 Z" fill={INK} fillOpacity="0.5" />
      <path d="M60 19 L60 26.5" stroke={INK} strokeOpacity="0.7" strokeWidth="1" />
      <circle cx="60" cy="27.5" r="1.8" fill={INK} fillOpacity="0.8" />
      {/* Soft drop shadow */}
      <ellipse cx="60" cy="106" rx="14" ry="2.5" fill={INK} fillOpacity="0.08" />
      {/* Teardrop body */}
      <path
        d="M60 28 C 53 31.5, 48.5 39, 47 50 C 45 64, 48.5 82, 60 97 C 71.5 82, 75 64, 73 50 C 71.5 39, 67 31.5, 60 28 Z"
        fill="url(#fable-ch-body)"
        stroke={MUTED}
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      {/* Upper segmentation ridges */}
      <g stroke={INK} strokeOpacity="0.22" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M51 40 Q 60 44 69 40" />
        <path d="M49.5 47 Q 60 51 70.5 47" />
        <path d="M60 32 L60 46" />
      </g>
      {/* The wing-case of the butterfly forming inside */}
      <g
        stroke={ACCENT_DEEP}
        strokeOpacity="0.35"
        strokeWidth="0.75"
        fill="none"
        strokeLinecap="round"
      >
        <path d="M57 36 C 52 44, 51 56, 54 68" />
        <path d="M63 36 C 68 44, 69 56, 66 68" />
        <path d="M58.5 40 C 56 48, 55.5 58, 57.5 66" />
        <path d="M61.5 40 C 64 48, 64.5 58, 62.5 66" />
      </g>
      {/* Metallic accent dots — the crown band */}
      <g fill={ACCENT}>
        <circle cx="50" cy="51" r="1" fillOpacity="0.8" />
        <circle cx="55" cy="53" r="1" fillOpacity="0.85" />
        <circle cx="60" cy="54" r="1.1" fillOpacity="0.9" />
        <circle cx="65" cy="53" r="1" fillOpacity="0.85" />
        <circle cx="70" cy="51" r="1" fillOpacity="0.8" />
      </g>
      {/* Accent sheen bands wrapping the abdomen */}
      <g stroke={ACCENT} fill="none" strokeLinecap="round">
        <path d="M48 58 Q 60 63 72 58" strokeWidth="1.5" strokeOpacity="0.5" />
        <path d="M48.8 65 Q 60 70 71.2 65" strokeWidth="1.25" strokeOpacity="0.4" />
        <path d="M50.4 73 Q 60 77.5 69.6 73" strokeWidth="1" strokeOpacity="0.3" />
        <path d="M52.8 81 Q 60 84.5 67.2 81" strokeWidth="0.75" strokeOpacity="0.22" />
      </g>
      {/* Cream highlight running down the lit flank */}
      <path
        d="M53 36 C 50 44, 49.5 56, 52 72"
        fill="none"
        stroke={CREAM}
        strokeWidth="2.5"
        strokeOpacity="0.6"
        strokeLinecap="round"
      />
      {/* Tip glint */}
      <circle cx="60" cy="93" r="0.9" fill={ACCENT_DEEP} fillOpacity="0.5" />
    </g>
  );
}

/* ── Caterpillar ────────────────────────────────────────────────────────── */

/** Body segments tail → head along a gentle arch (drawn in order so overlap reads). */
const CATERPILLAR_SEGMENTS: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: 16, y: 82, r: 7.5 },
  { x: 26, y: 76.5, r: 8.5 },
  { x: 37, y: 72, r: 9.5 },
  { x: 49, y: 69.5, r: 10 },
  { x: 61, y: 69, r: 10 },
  { x: 73, y: 70.5, r: 10 },
  { x: 84, y: 74, r: 9.5 },
];

function CaterpillarArt(): ReactElement {
  return (
    <g>
      <defs>
        <linearGradient id="fable-ca-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.7" stopColor={SAND} />
          <stop offset="1" stopColor={SAND} stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="fable-ca-head" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="1" stopColor={SAND} />
        </linearGradient>
      </defs>
      {/* Ground hint */}
      <path
        d="M8 96 C 40 92.5, 80 92.5, 112 95"
        fill="none"
        stroke={INK}
        strokeOpacity="0.14"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx="24" cy="94" r="0.9" fill={ACCENT} fillOpacity="0.35" />
      <circle cx="70" cy="93.4" r="0.9" fill={ACCENT} fillOpacity="0.3" />
      <circle cx="103" cy="95" r="0.9" fill={ACCENT} fillOpacity="0.35" />
      {/* Prolegs under the mid-body segments */}
      <g stroke={INK} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round">
        {CATERPILLAR_SEGMENTS.slice(2).map((s, i) => (
          <g key={i}>
            <path d={`M${s.x - 2.5} ${s.y + s.r - 2} L ${s.x - 3.5} ${s.y + s.r + 4}`} />
            <path d={`M${s.x + 2.5} ${s.y + s.r - 2} L ${s.x + 3.5} ${s.y + s.r + 4}`} />
          </g>
        ))}
      </g>
      {/* Body segments — tail drawn first so the head overlaps forward */}
      {CATERPILLAR_SEGMENTS.map((s, i) => (
        <g key={i}>
          <circle
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="url(#fable-ca-body)"
            stroke={INK}
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          {/* Cream highlight on the upper-left of each segment */}
          <path
            d={`M${s.x - 5} ${s.y - 1.5} Q ${s.x - 4.5} ${s.y - s.r + 2.5} ${s.x + 0.5} ${s.y - s.r + 1.5}`}
            fill="none"
            stroke={CREAM}
            strokeWidth="1.4"
            strokeOpacity="0.55"
            strokeLinecap="round"
          />
          {/* Accent dot along the back, muted spiracle on the flank */}
          <circle cx={s.x} cy={s.y - s.r + 3.5} r="1.4" fill={ACCENT} fillOpacity="0.85" />
          <circle cx={s.x + 3.5} cy={s.y + 2} r="0.7" fill={MUTED} fillOpacity="0.6" />
        </g>
      ))}
      {/* Head — slightly larger, drawn last */}
      <circle
        cx="96"
        cy="78"
        r="10.5"
        fill="url(#fable-ca-head)"
        stroke={INK}
        strokeOpacity="0.65"
        strokeWidth="1.1"
      />
      <path
        d="M90.5 76 Q 91.5 69.5 96.5 68"
        fill="none"
        stroke={CREAM}
        strokeWidth="1.4"
        strokeOpacity="0.55"
        strokeLinecap="round"
      />
      {/* Filaments (tiny horns) with accent tips */}
      <g stroke={INK} strokeOpacity="0.7" strokeWidth="1" fill="none" strokeLinecap="round">
        <path d="M101 69 C 103 65, 106 62.5, 109 61" />
        <path d="M97 68.4 C 98 64.5, 100 61, 102.5 58.5" />
      </g>
      <circle cx="109.4" cy="60.6" r="1.2" fill={ACCENT} fillOpacity="0.9" />
      <circle cx="102.9" cy="58.1" r="1" fill={ACCENT} fillOpacity="0.8" />
      {/* Face — eye with glint, cheek blush, small smile */}
      <circle cx="99" cy="76" r="1.4" fill={INK} fillOpacity="0.9" />
      <circle cx="99.5" cy="75.4" r="0.5" fill={CREAM} />
      <circle cx="93" cy="81" r="1.6" fill={ACCENT} fillOpacity="0.3" />
      <path
        d="M93 84 Q 96 86 99.5 84.5"
        fill="none"
        stroke={INK}
        strokeOpacity="0.6"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </g>
  );
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export function FableButterfly({
  variant = "butterfly",
  className,
}: {
  variant?: "butterfly" | "chrysalis" | "caterpillar";
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
      {variant === "chrysalis" ? (
        <ChrysalisArt />
      ) : variant === "caterpillar" ? (
        <CaterpillarArt />
      ) : (
        <ButterflyArt />
      )}
    </svg>
  );
}

/**
 * Section divider — a hairline rule with three tiny butterflies alighting on
 * it (the same hand-authored butterfly, scaled down). Purely decorative.
 */
export function FableDivider({ className }: { className?: string }) {
  const hairline = {
    background: "color-mix(in oklab, var(--color-cw-ink, currentColor) 20%, transparent)",
  } as const;
  return (
    <div className={cn("flex items-center gap-4", className)} aria-hidden="true">
      <span className="h-px flex-1" style={hairline} />
      <span className="flex items-end gap-3">
        <FableButterfly className="size-3.5 -rotate-12 opacity-60" />
        <FableButterfly className="size-5 -translate-y-0.5" />
        <FableButterfly className="size-3.5 rotate-12 opacity-60" />
      </span>
      <span className="h-px flex-1" style={hairline} />
    </div>
  );
}
