import type { VerticalPreset } from "../types";

/** Restaurant / Bistro — warm, seasonal, from-our-kitchen neighbourhood voice. */
export const restaurantPreset: VerticalPreset = {
  slug: "restaurant",
  name: "Restaurant / Bistro",
  description:
    "Warm, generous voice for a neighbourhood restaurant or bistro — a short seasonal menu, honest cooking, and a table that's never rushed.",
  keywords: ["restaurant", "bistro", "dining", "menu", "chef", "kitchen", "seasonal", "eatery"],
  identity: { tone: "warm", audience: "consumer", formality: "balanced", vibe: "seasonal, generous, neighbourly" },
  // Ember (mode: both) is genome-aware + palette-adaptive — its warm gradient-mesh
  // hero suits a bistro, so no 3D scene is set (the mesh IS the statement piece).
  suggestedDesignSlug: "ember",
  // Deep bistro green on warm cream — aged paper, candlelight, chalkboard menu.
  palette: {
    accent: "#1e5e3e",
    accentDeep: "#14402b",
    cream: "#faf6ec",
    sand: "#f0e7d3",
    ink: "#241f17",
    muted: "#6f6754",
  },
  genomeOverrides: {
    "home.hero.eyebrow": "From our kitchen",
    "home.hero.headline": "Good food, close to home",
    "home.hero.tagline":
      "A neighbourhood bistro with a short, seasonal menu — honest cooking, natural wines, and a table that's never rushed.",
    "home.hero.cta": "Book a table",
    "home.valueProps.title": "Cooked with the seasons",
    "home.valueProps.description":
      "The menu changes with the market — what's good right now is what's on your plate.",
    "home.features.title": "This season's table",
    "home.features.description":
      "Lunch, dinner, and Sunday roasts — plus a small list of natural wines we pour by the glass.",
    "home.ctaFooter.title": "Your table is waiting",
    "home.ctaFooter.description":
      "Book online or call us — and tell us if you're celebrating, we'll bring something special.",
    "home.ctaFooter.cta": "Book a table",
    "home.valueProps.items": JSON.stringify([
      {
        title: "Seasonal menu",
        body: "A short menu that changes with the market — fresh, local, and never frozen.",
      },
      {
        title: "From scratch daily",
        body: "Stocks, sauces, bread, and desserts — all made in our own kitchen every day.",
      },
      {
        title: "Yours for the evening",
        body: "Book a table and it's yours all night — no second seating, no hurry.",
      },
    ]),
    "home.features.items": JSON.stringify([
      {
        title: "Lunch & dinner",
        body: "Classic bistro plates done properly, from confit to crème brûlée.",
      },
      {
        title: "Wines we love",
        body: "A short, natural-leaning list — ask, and we'll find your new favourite.",
      },
      {
        title: "Private dining",
        body: "Birthdays, anniversaries, and long lunches — our back room seats twenty.",
      },
    ]),
  },
};
