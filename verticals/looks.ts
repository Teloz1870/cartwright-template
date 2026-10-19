/**
 * Cartwright Looks — curated Skin × Voice combinations (client-safe, pure data).
 *
 * Content and design are orthogonal in Cartwright: a design (Skin) controls how
 * the page looks, and a Voice (vertical preset) re-tones the copy + palette for
 * an industry. A "Look" is a hand-picked pairing of the two — proof that the
 * same engine, dressed differently, fits very different businesses. Because the
 * Skins here are palette-adaptive, the page wears the VOICE's palette.
 *
 * Single source of truth for the cartwright.app Looks gallery, emitted via the
 * marketplace manifest (`looks`). Each entry references an existing design slug
 * (designs/options.ts) and an existing voice slug (verticals/index.ts) — the
 * marketplace-manifest test validates both references, so a dangling slug
 * fails CI.
 */

export type LookEntry = {
  slug: string;
  /** Evocative name for the combo. */
  name: string;
  /** Curator's note — why this pairing works. */
  description: string;
  /** References a design slug (the Skin). */
  designSlug: string;
  /** References a vertical preset slug (the Voice). */
  voiceSlug: string;
  /**
   * Optional chrome selection (Mixer 2.0) — header/footer registry keys
   * (lib/builder/chrome-catalog.ts). Must be selectable on `designSlug`
   * (validated when the look is expanded via lookToComposition — the
   * marketplace-manifest test fails CI on a non-mixable pairing). Omitted =
   * the Skin's own chrome.
   */
  chrome?: { headerKey?: string; footerKey?: string };
};

export const LOOKS: LookEntry[] = [
  {
    slug: "canopy",
    name: "Canopy",
    description:
      "The friendly flagship: jungle's organic, atom-composed layout wearing a kindergarten's warm green Voice.",
    designSlug: "jungle",
    voiceSlug: "kindergarten",
  },
  {
    slug: "slow-mornings",
    name: "Slow Mornings",
    description:
      "Aurora's airy website, re-toned cozy and artisanal for a neighbourhood café.",
    designSlug: "aurora-site",
    voiceSlug: "cafe",
  },
  {
    slug: "the-workshop",
    name: "The Workshop",
    description:
      "Studio's warm-tech confidence, dressed as an honest building trade you'd trust with your home.",
    designSlug: "studio",
    voiceSlug: "carpenter",
  },
  {
    slug: "quiet-luxe",
    name: "Quiet Luxe",
    description:
      "Calm, polished Aurora for a salon or spa — relaxed luxury that makes booking feel like a treat.",
    designSlug: "aurora-site",
    voiceSlug: "salon",
  },
  {
    slug: "the-roastery",
    name: "The Roastery",
    description:
      "A café that sells its beans: Aurora's clean storefront in a warm, freshly-roasted Voice.",
    designSlug: "aurora-shop",
    voiceSlug: "cafe",
  },
  {
    slug: "atelier",
    name: "Atelier",
    description:
      "The flagship super-pro storefront (Apex) carrying a champagne-gold spa Voice — a complete luxe shop.",
    designSlug: "apex",
    voiceSlug: "salon",
  },
  {
    slug: "trusted-local",
    name: "Trusted Local",
    description:
      "The same carpenter Voice on a different Skin — Aurora instead of Studio. One Voice, two looks.",
    designSlug: "aurora-site",
    voiceSlug: "carpenter",
  },
  {
    slug: "garden-cafe",
    name: "Garden Café",
    description:
      "Jungle's playful structure carrying the café Voice's warm palette — the same Skin as Canopy, a different Voice.",
    designSlug: "jungle",
    voiceSlug: "cafe",
  },
  {
    slug: "metamorphosis",
    name: "Metamorphosis",
    description:
      "The full launch composition — the FABLE skin with its own launch-announcement voice. Butterflies in your brand colours.",
    designSlug: "fable",
    voiceSlug: "fable",
  },
];
