/**
 * SVG item library — premium, hand-authored, palette-adaptive inline SVG
 * components (marks, dividers, illustrations).
 *
 * Every component is a pure server component (no client JS), fully
 * self-contained (zero imports), reads all colour from the cw-* palette
 * tokens with the engine fallback chain, and accepts a single optional
 * `className`. `SVG_ITEMS` is the client-safe manifest of what ships —
 * the registry export and any gallery UI read it.
 *
 * v2 adds nine ANIMATED items (`animated: true`): motion is pure CSS in a
 * scoped <style> block per component — compositor-only transform/opacity
 * keyframes, namespaced `cwsi-<slug>-*` selectors, everything inside
 * `@media (prefers-reduced-motion: no-preference)` so reduced motion always
 * renders a beautiful static frame. The four hover-capable v1 items
 * (OrbitMark, CometMark, SunburstMark, MothIllustration) additionally carry
 * opt-in `.cwsi-animate`-gated hover rules — without that wrapper class
 * their render is visually unchanged.
 */

export { OrbitMark } from "./OrbitMark";
export { PrismMark } from "./PrismMark";
export { ConstellationMark } from "./ConstellationMark";
export { CometMark } from "./CometMark";
export { SunburstMark } from "./SunburstMark";
export { LatticeMark } from "./LatticeMark";
export { WaveDivider } from "./WaveDivider";
export { VineDivider } from "./VineDivider";
export { BloomIllustration } from "./BloomIllustration";
export { MountainIllustration } from "./MountainIllustration";
export { CrystalIllustration } from "./CrystalIllustration";
export { MothIllustration } from "./MothIllustration";
export { OrbitMarkLive } from "./OrbitMarkLive";
export { ConstellationTwinkle } from "./ConstellationTwinkle";
export { CometStreak } from "./CometStreak";
export { WaveDividerFlow } from "./WaveDividerFlow";
export { VineDividerGrow } from "./VineDividerGrow";
export { AuroraRibbon } from "./AuroraRibbon";
export { ButterflySwarm } from "./ButterflySwarm";
export { BloomOpen } from "./BloomOpen";
export { FireflyField } from "./FireflyField";

export type SvgItemKind = "mark" | "divider" | "illustration";

export type SvgItem = {
  /** Stable kebab-case id; the registry serves each item as `svg-<slug>`. */
  slug: string;
  /** Display name (matches the exported component name in PascalCase). */
  name: string;
  kind: SvgItemKind;
  description: string;
  /** True when the item ships CSS animation (reduced-motion safe). */
  animated: boolean;
};

/** Client-safe manifest of the library (data only — no component refs). */
export const SVG_ITEMS: SvgItem[] = [
  {
    slug: "orbit-mark",
    name: "Orbit Mark",
    kind: "mark",
    description:
      "A ringed planet held by two elliptical orbits with moons riding the near arcs.",
    animated: false,
  },
  {
    slug: "prism-mark",
    name: "Prism Mark",
    kind: "mark",
    description:
      "A glass prism refracting one beam into a tonal spectrum fan that fades to the right.",
    animated: false,
  },
  {
    slug: "constellation-mark",
    name: "Constellation Mark",
    kind: "mark",
    description:
      "A star-chart asterism of connected stars at varied magnitudes inside a graduated ring.",
    animated: false,
  },
  {
    slug: "comet-mark",
    name: "Comet Mark",
    kind: "mark",
    description:
      "A comet head with a layered, particle-strewn tail arcing toward the corner.",
    animated: false,
  },
  {
    slug: "sunburst-mark",
    name: "Sunburst Mark",
    kind: "mark",
    description:
      "A radiant sun with sixteen alternating long and short rays around a gradient disc.",
    animated: false,
  },
  {
    slug: "lattice-mark",
    name: "Lattice Mark",
    kind: "mark",
    description:
      "Two squares and a circle interlaced in a true over-under weave around a fine inner lattice.",
    animated: false,
  },
  {
    slug: "wave-divider",
    name: "Wave Divider",
    kind: "divider",
    description:
      "A horizontal rule of four layered wave strands that fade out at both ends, with foam beads on the crests.",
    animated: false,
  },
  {
    slug: "vine-divider",
    name: "Vine Divider",
    kind: "divider",
    description:
      "A branching vine rule with alternating leaves, buds, curling tendrils and a small open bloom at the centre.",
    animated: false,
  },
  {
    slug: "bloom-illustration",
    name: "Bloom Illustration",
    kind: "illustration",
    description:
      "An opening flower with three layered petal rings, a stamen crown, stem and leaves, and one petal mid-fall.",
    animated: false,
  },
  {
    slug: "mountain-illustration",
    name: "Mountain Illustration",
    kind: "illustration",
    description:
      "Receding ridgelines with real atmospheric depth under a warm sun, mist in the valley, pines on the foothill.",
    animated: false,
  },
  {
    slug: "crystal-illustration",
    name: "Crystal Illustration",
    kind: "illustration",
    description:
      "A faceted crystal cluster growing from rock, lit facets against shaded ones around an inner glow.",
    animated: false,
  },
  {
    slug: "moth-illustration",
    name: "Moth Illustration",
    kind: "illustration",
    description:
      "A night-moth with banded dusty wings, eyespots and feathered antennae, resting under a crescent moon.",
    animated: false,
  },
  {
    slug: "orbit-mark-live",
    name: "Orbit Mark Live",
    kind: "mark",
    description:
      "The ringed planet with both moons actually riding their elliptical orbits while the planet softly breathes.",
    animated: true,
  },
  {
    slug: "constellation-twinkle",
    name: "Constellation Twinkle",
    kind: "mark",
    description:
      "A star chart whose asterism pulses in sequence, visited by a shooting star roughly every fifteen seconds.",
    animated: true,
  },
  {
    slug: "comet-streak",
    name: "Comet Streak",
    kind: "mark",
    description:
      "A comet with a living tail — dust particles stream toward the tip while the head glow pulses.",
    animated: true,
  },
  {
    slug: "wave-divider-flow",
    name: "Wave Divider Flow",
    kind: "divider",
    description:
      "Three wave strands flowing past each other in an endless seamless drift, melting into the page at both ends.",
    animated: true,
  },
  {
    slug: "vine-divider-grow",
    name: "Vine Divider Grow",
    kind: "divider",
    description:
      "A vine rule that draws itself in as it scrolls into view, leaves fading in behind the growing stem.",
    animated: true,
  },
  {
    slug: "aurora-ribbon",
    name: "Aurora Ribbon",
    kind: "divider",
    description:
      "Layered aurora ribbons undulating in slow counter-phase, shimmering like northern lights stretched into a rule.",
    animated: true,
  },
  {
    slug: "butterfly-swarm",
    name: "Butterfly Swarm",
    kind: "illustration",
    description:
      "Five hand-drawn butterflies drifting in loose formation, wings beating in offset rhythm along a dotted flight line.",
    animated: true,
  },
  {
    slug: "bloom-open",
    name: "Bloom Open",
    kind: "illustration",
    description:
      "A flower whose petal rings unfold from the heart outward, then sway gently on the stem while one petal drifts down.",
    animated: true,
  },
  {
    slug: "firefly-field",
    name: "Firefly Field",
    kind: "illustration",
    description:
      "A dusk meadow where ten fireflies blink and drift in staggered rhythm above the grass.",
    animated: true,
  },
];
