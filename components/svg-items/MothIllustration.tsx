/**
 * MothIllustration — a night-moth at rest under a sliver of moon: broad
 * dusty wings, banded markings, eyespots, and feathered (plumose) antennae.
 *
 * Hand-authored, hero-grade inline SVG (server component, no client JS).
 * The deliberate sibling to the Fable butterfly — same construction (one
 * wing side mirrored around x=60), entirely different animal: horizontal
 * swept wings, comb-toothed antennae, muted moth colours, a crescent moon
 * for company. All paint reads the cw-* palette tokens with the engine
 * fallback chain; gradient ids are stable and namespaced (`cwsi-moth-*`).
 *
 * Opt-in hover motion: render inside an element carrying the `cwsi-animate`
 * class and the moth stirs on hover (wings breathe outward, antennae quiver,
 * the moon glows, wing-dust shimmers). Without that class — or under reduced
 * motion — nothing ever moves.
 *
 * Fully self-contained (zero imports) → installable via /api/registry.
 */
import type { ReactElement } from "react";

/** Hover-only motion, gated on both `.cwsi-animate` and reduced-motion. */
const MOTH_HOVER_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .cwsi-animate:hover .cwsi-moth-hov-wing {
    transform-box: fill-box;
    transform-origin: 100% 50%;
    animation: cwsi-moth-hovbreathe 4.6s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-moth-hov-ant {
    transform-box: fill-box;
    transform-origin: 100% 100%;
    animation: cwsi-moth-hovquiver 3.8s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-moth-hov-moon {
    animation: cwsi-moth-hovmoon 4.6s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-moth-hov-dust {
    animation: cwsi-moth-hovdust 4.6s ease-in-out infinite;
  }
  .cwsi-animate:hover .cwsi-moth-hov-dust2 { animation-delay: -2.3s; }
  @keyframes cwsi-moth-hovbreathe {
    0%, 100% { transform: scaleX(1); }
    50% { transform: scaleX(1.045); }
  }
  @keyframes cwsi-moth-hovquiver {
    0%, 100% { transform: rotate(0deg); }
    30% { transform: rotate(2deg); }
    65% { transform: rotate(-1.6deg); }
  }
  @keyframes cwsi-moth-hovmoon {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
  }
  @keyframes cwsi-moth-hovdust {
    0%, 100% { opacity: 0.5; transform: translate(0, 0); }
    50% { opacity: 1; transform: translate(0.8px, 1.4px); }
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
const MUTED = "var(--color-cw-muted, var(--color-cw-stone-500, currentColor))";

/** Barbs of the plumose antenna — positions along the left shaft, leaning out. */
const BARBS: ReadonlyArray<{ x: number; y: number; dx: number; dy: number }> = [
  { x: 56.4, y: 45.6, dx: -2.6, dy: -1.2 },
  { x: 55, y: 43.4, dx: -2.9, dy: -1.4 },
  { x: 53.5, y: 41.3, dx: -3.2, dy: -1.5 },
  { x: 51.9, y: 39.3, dx: -3.3, dy: -1.7 },
  { x: 50.2, y: 37.4, dx: -3.2, dy: -1.9 },
  { x: 48.4, y: 35.7, dx: -3, dy: -2 },
  { x: 46.6, y: 34.1, dx: -2.6, dy: -2 },
  { x: 44.8, y: 32.7, dx: -2.1, dy: -1.9 },
  { x: 56.2, y: 44.2, dx: 1.7, dy: -1.9 },
  { x: 54.6, y: 42, dx: 1.9, dy: -2.1 },
  { x: 52.9, y: 39.9, dx: 1.9, dy: -2.2 },
  { x: 51.1, y: 37.9, dx: 1.8, dy: -2.2 },
  { x: 49.2, y: 36.1, dx: 1.6, dy: -2.1 },
  { x: 47.3, y: 34.5, dx: 1.3, dy: -1.9 },
];

/** One wing side (left); the right side is this group mirrored around x=60. */
function MothWingSide(): ReactElement {
  return (
    <g className="cwsi-moth-hov-wing">
      {/* Forewing — long, horizontal sweep with a soft falcate tip */}
      <path
        d="M56 55 C 44 47.5, 28 45, 16 50.5 C 8.5 54, 8 62, 15.5 67.5 C 27 75.5, 44 77, 55 71 C 58 66.5, 58 60, 56 55 Z"
        fill="url(#cwsi-moth-fore)"
        stroke={OKER_DEEP}
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      {/* Hindwing — small rounded fan tucked beneath */}
      <path
        d="M55 71 C 48 72.5, 40.5 77.5, 37.5 85 C 35.8 90.5, 39.5 95, 45 94 C 51.5 92.8, 55.8 86.5, 56.5 78 Z"
        fill="url(#cwsi-moth-hind)"
        stroke={OKER_DEEP}
        strokeOpacity="0.45"
        strokeWidth="0.75"
      />
      {/* Transverse bands — the moth's wavering wing script */}
      <g stroke={INK} strokeOpacity="0.3" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M52 53.5 C 42 49.5, 30 48, 20 51.5" />
        <path d="M53 60.5 C 42 58, 30 57.5, 19 60" />
        <path d="M52.5 67 C 43 67.5, 32.5 68.5, 22 66.5" />
        <path d="M48 72.5 C 44 78, 41.5 83, 41 88.5" />
      </g>
      {/* Wing veins radiating from the root */}
      <g stroke={INK} strokeOpacity="0.18" strokeWidth="0.75" fill="none" strokeLinecap="round">
        <path d="M55 56.5 C 45 52, 33 49.5, 22 50" />
        <path d="M55 63 C 44 62, 31 62, 18 63.5" />
        <path d="M55 69 C 46 70.5, 36 72, 26 71.5" />
        <path d="M54 74 C 49.5 78.5, 46 84, 44.5 90" />
      </g>
      {/* Dusty sheen along the leading edge */}
      <path
        d="M50 51.5 C 41 47.8, 30 46.5, 20.5 49"
        fill="none"
        stroke={CREAM}
        strokeOpacity="0.35"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Forewing eyespot — ringed, warm-hearted */}
      <circle cx="32" cy="59.5" r="3.4" fill={CREAM} fillOpacity="0.85" />
      <circle cx="32" cy="59.5" r="2.1" fill={OKER_DEEP} fillOpacity="0.9" />
      <circle cx="32" cy="59.5" r="0.9" fill={INK} fillOpacity="0.85" />
      <circle cx="31.2" cy="58.7" r="0.45" fill={CREAM} />
      {/* Hindwing spot */}
      <circle cx="45.5" cy="84" r="1.7" fill={OKER} fillOpacity="0.7" />
      <circle cx="45.5" cy="84" r="0.7" fill={OKER_DEEP} fillOpacity="0.8" />
      {/* Fringe — fine ticks along the outer margins */}
      <g stroke={MUTED} strokeOpacity="0.55" strokeWidth="0.75" strokeLinecap="round">
        <path d="M14.2 53.5 L12 52.6" />
        <path d="M12.5 58 L10.2 57.7" />
        <path d="M12.4 62.5 L10.1 62.9" />
        <path d="M14 66.8 L11.9 67.9" />
        <path d="M38.2 89.5 L36.5 91" />
        <path d="M41.5 93 L40.4 95" />
      </g>
      {/* Plumose antenna — shaft + comb barbs on both sides */}
      <g className="cwsi-moth-hov-ant">
        <path
          d="M57.5 47 C 53.5 43, 49 38, 43.5 31.5"
          fill="none"
          stroke={INK}
          strokeOpacity="0.7"
          strokeWidth="0.75"
          strokeLinecap="round"
        />
        <g stroke={INK} strokeOpacity="0.5" strokeWidth="0.75" strokeLinecap="round">
          {BARBS.map((b, i) => (
            <path key={i} d={`M${b.x} ${b.y} l${b.dx} ${b.dy}`} />
          ))}
        </g>
        <circle cx="43.2" cy="31.2" r="0.7" fill={INK} fillOpacity="0.7" />
      </g>
    </g>
  );
}

export function MothIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="cwsi-moth-fore" x1="1" y1="0" x2="0" y2="0.6">
          <stop offset="0" stopColor={CREAM} stopOpacity="0.9" />
          <stop offset="0.45" stopColor={OKER} stopOpacity="0.55" />
          <stop offset="1" stopColor={OKER_DEEP} stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="cwsi-moth-hind" x1="1" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={CREAM} stopOpacity="0.85" />
          <stop offset="1" stopColor={OKER} stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: MOTH_HOVER_CSS }} />

      {/* Crescent moon + night sparks, up and to the right */}
      <path
        className="cwsi-moth-hov-moon"
        d="M100 10.5 C 93 13.5, 93 26.5, 100 29.5 C 95.5 25, 95.5 15, 100 10.5 Z"
        fill={OKER}
        fillOpacity="0.55"
        stroke={OKER_DEEP}
        strokeOpacity="0.4"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <g stroke={INK} strokeOpacity="0.4" strokeWidth="0.75" strokeLinecap="round">
        <path d="M88 18 L88 21.6 M86.2 19.8 L89.8 19.8" />
      </g>
      <circle cx="108" cy="22" r="0.7" fill={MUTED} fillOpacity="0.5" />
      <circle cx="96" cy="36" r="0.6" fill={INK} fillOpacity="0.3" />
      <circle cx="16" cy="22" r="0.7" fill={MUTED} fillOpacity="0.45" />
      <circle cx="24" cy="32" r="0.5" fill={INK} fillOpacity="0.3" />

      {/* Left wings + antenna, mirrored to the right */}
      <MothWingSide />
      <g transform="matrix(-1 0 0 1 120 0)">
        <MothWingSide />
      </g>

      {/* Body — furry head, stout thorax, banded tapering abdomen */}
      <circle cx="60" cy="49.5" r="3.2" fill={INK} fillOpacity="0.9" />
      <ellipse cx="60" cy="58.5" rx="4.6" ry="7.5" fill={INK} fillOpacity="0.92" />
      {/* Fur tufts bristling off the thorax */}
      <g stroke={INK} strokeOpacity="0.45" strokeWidth="0.75" strokeLinecap="round">
        <path d="M55.6 54.5 L53.6 53.4" />
        <path d="M55 58.5 L52.8 58.2" />
        <path d="M55.5 62.5 L53.5 63.4" />
        <path d="M64.4 54.5 L66.4 53.4" />
        <path d="M65 58.5 L67.2 58.2" />
        <path d="M64.5 62.5 L66.5 63.4" />
      </g>
      {/* Collar highlight behind the head */}
      <path
        d="M56.5 52.5 Q 60 50.8 63.5 52.5"
        fill="none"
        stroke={CREAM}
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Abdomen */}
      <path
        d="M60 65 C 63.6 71, 64 83, 60 96 C 56 83, 56.4 71, 60 65 Z"
        fill={INK}
        fillOpacity="0.88"
      />
      {/* Alternating segment bands — ink moths wear warm stripes */}
      <g strokeLinecap="round" fill="none">
        <path d="M57.4 71 L62.6 71" stroke={OKER} strokeOpacity="0.6" strokeWidth="0.75" />
        <path d="M57.2 76.5 L62.8 76.5" stroke={CREAM} strokeOpacity="0.35" strokeWidth="0.75" />
        <path d="M57.6 82 L62.4 82" stroke={OKER} strokeOpacity="0.5" strokeWidth="0.75" />
        <path d="M58.2 87.5 L61.8 87.5" stroke={CREAM} strokeOpacity="0.3" strokeWidth="0.75" />
        <path d="M58.9 92 L61.1 92" stroke={OKER} strokeOpacity="0.4" strokeWidth="0.75" />
      </g>
      {/* Eyes catching the moonlight */}
      <circle cx="57.8" cy="48.8" r="0.8" fill={CREAM} fillOpacity="0.5" />
      <circle cx="62.2" cy="48.8" r="0.8" fill={CREAM} fillOpacity="0.5" />

      {/* Wing-dust falling away beneath the moth */}
      <circle className="cwsi-moth-hov-dust" cx="34" cy="100" r="0.7" fill={OKER} fillOpacity="0.4" />
      <circle className="cwsi-moth-hov-dust cwsi-moth-hov-dust2" cx="52" cy="105" r="0.6" fill={MUTED} fillOpacity="0.45" />
      <circle className="cwsi-moth-hov-dust" cx="70" cy="103" r="0.6" fill={OKER} fillOpacity="0.35" />
      <circle className="cwsi-moth-hov-dust cwsi-moth-hov-dust2" cx="86" cy="98" r="0.7" fill={ACCENT} fillOpacity="0.3" />
      <circle className="cwsi-moth-hov-dust" cx="20" cy="92" r="0.5" fill={ACCENT_DEEP} fillOpacity="0.3" />
    </svg>
  );
}
