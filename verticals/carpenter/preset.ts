import type { VerticalPreset } from "../types";

/** Carpenter / Tømrer — solid, honest, trades voice for homeowners. */
export const carpenterPreset: VerticalPreset = {
  slug: "carpenter",
  name: "Carpenter",
  description:
    "Solid, honest, no-nonsense voice for a carpenter or building trade — built to earn a homeowner's trust and win the quote.",
  keywords: ["carpenter", "builder", "joinery", "trades", "construction", "renovation", "craftsman"],
  aliases: ["tømrer"],
  identity: { tone: "professional", audience: "consumer", formality: "balanced", vibe: "solid, honest, handcrafted" },
  // v1: aurora-site is the Voice-aware website skin. More skins (studio, jungle)
  // become Voice-aware in a follow-up; update this then.
  suggestedDesignSlug: "aurora-site",
  // Warm wood/amber palette + the structured "wireframe" scene (blueprint vibe).
  palette: {
    accent: "#b45309",
    accentDeep: "#78350f",
    cream: "#fdf6ec",
    sand: "#efe1cf",
    ink: "#241810",
    muted: "#8a6f57",
  },
  scene: "wireframe",
  genomeOverrides: {
    "home.hero.eyebrow": "Local & trusted",
    "home.hero.headline": "Craftsmanship you can stand on",
    "home.hero.tagline":
      "From kitchens to decks, we build it solid, on time, and on budget — work that lasts for decades, not seasons.",
    "home.hero.cta": "Get a quote",
    "home.valueProps.title": "Built to last",
    "home.valueProps.description":
      "Honest pricing, clean sites, and joinery we're proud to put our name on.",
    "home.features.title": "What we build",
    "home.features.description":
      "Kitchens, extensions, decks, and bespoke fit-outs — fully finished and properly guaranteed.",
    "home.ctaFooter.title": "Let's build it",
    "home.ctaFooter.description":
      "Tell us about your project and we'll send a clear, no-surprises quote within days.",
    "home.ctaFooter.cta": "Get a quote",
    "home.valueProps.items": JSON.stringify([
      { title: "Honest quotes", body: "Clear pricing up front — no surprises when the invoice arrives." },
      { title: "Clean, safe sites", body: "We respect your home and tidy up at the end of every day." },
      { title: "Guaranteed work", body: "Built properly and backed by a written guarantee." },
    ]),
    "home.features.items": JSON.stringify([
      { title: "Kitchens & joinery", body: "Bespoke kitchens, wardrobes, and built-in storage." },
      { title: "Extensions & decks", body: "From garden decks to full single-storey extensions." },
      { title: "Repairs & fit-outs", body: "Doors, floors, and skirting — finished properly." },
    ]),
  },
};
