import type { VerticalPreset } from "../types";

/** Café — cozy, slow, artisanal neighbourhood-coffee voice. */
export const cafePreset: VerticalPreset = {
  slug: "cafe",
  name: "Café / Coffee shop",
  description:
    "Cozy, slow, artisanal voice for a neighbourhood café or coffee shop — warm and inviting, all about staying a while.",
  keywords: ["cafe", "café", "coffee", "espresso", "bakery", "brunch", "cozy", "artisanal"],
  identity: { tone: "warm", audience: "consumer", formality: "casual", vibe: "cozy, slow, artisanal" },
  suggestedDesignSlug: "aurora-site",
  // Warm coffee/terracotta palette + the flowing "aurora" scene (cozy warmth).
  palette: {
    accent: "#c2410c",
    accentDeep: "#7c2d12",
    cream: "#fdf6ee",
    sand: "#ece0d0",
    ink: "#2a1c14",
    muted: "#8a7561",
  },
  scene: "aurora",
  genomeOverrides: {
    "home.hero.eyebrow": "Freshly roasted",
    "home.hero.headline": "Your neighbourhood for slow mornings",
    "home.hero.tagline":
      "Single-origin coffee, warm pastries, and a corner that feels like home — pull up a chair and stay a while.",
    "home.hero.cta": "See the menu",
    "home.valueProps.title": "Made with care",
    "home.valueProps.description":
      "Beans roasted in small batches, milk from local farms, and baristas who know your order.",
    "home.features.title": "On the menu",
    "home.features.description":
      "Espresso, filter, and seasonal specials — plus cakes baked fresh in our own kitchen every morning.",
    "home.ctaFooter.title": "Come for a cup",
    "home.ctaFooter.description":
      "Find us on the corner, or order ahead and skip the queue — your table is waiting.",
    "home.ctaFooter.cta": "Find us",
    "home.valueProps.items": JSON.stringify([
      { title: "Small-batch roasts", body: "Beans roasted weekly so every cup tastes bright and fresh." },
      { title: "Baked in-house", body: "Cakes and pastries from our own kitchen every morning." },
      { title: "Your local corner", body: "Comfy chairs, free wifi, and baristas who remember your order." },
    ]),
    "home.features.items": JSON.stringify([
      { title: "Coffee, done right", body: "Espresso, filter, and seasonal specials all day." },
      { title: "Fresh from the oven", body: "Cakes, pastries, and brunch made in-house." },
      { title: "A place to linger", body: "Plenty of seats, plugs, and good light." },
    ]),
  },
};
