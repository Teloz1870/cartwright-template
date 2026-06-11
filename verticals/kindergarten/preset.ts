import type { VerticalPreset } from "../types";

/** Kindergarten / Børnehave — warm, playful, parent-facing childcare voice. */
export const kindergartenPreset: VerticalPreset = {
  slug: "kindergarten",
  name: "Kindergarten / Børnehave",
  description:
    "Warm, playful, reassuring voice for a kindergarten or daycare — built to make parents feel their child will be safe, happy, and growing.",
  keywords: ["kindergarten", "børnehave", "daycare", "childcare", "preschool", "kids", "playful", "warm"],
  identity: { tone: "warm", audience: "consumer", formality: "casual", vibe: "playful, safe, nurturing" },
  suggestedDesignSlug: "jungle",
  // Playful leaf-green palette → the palette-reactive "waves" scene reads green,
  // so the 3D hero looks like a friendly jungle canopy. The full børnehave vibe.
  palette: {
    accent: "#16a34a",
    accentDeep: "#15803d",
    cream: "#f6fef0",
    sand: "#dcfce7",
    ink: "#13251a",
    muted: "#6f8e7c",
  },
  scene: "waves",
  genomeOverrides: {
    "home.hero.eyebrow": "Now enrolling",
    "home.hero.headline": "A warm place to play, learn, and grow",
    "home.hero.tagline":
      "A safe, joyful day for every child — caring teachers, plenty of outdoor play, and parents always in the loop.",
    "home.hero.cta": "Book a visit",
    "home.valueProps.title": "Why families choose us",
    "home.valueProps.description":
      "Small groups, big hearts, and a day built around play, nature, and curiosity.",
    "home.features.title": "A day full of wonder",
    "home.features.description":
      "From morning circle to muddy puddles — every day is planned to help little ones thrive.",
    "home.ctaFooter.title": "Come say hello",
    "home.ctaFooter.description":
      "Book a visit and see the smiles for yourself — we'd love to meet your family.",
    "home.ctaFooter.cta": "Book a visit",
    "home.valueProps.items": JSON.stringify([
      { title: "Caring teachers", body: "Every child is known by name — warm, patient, and always present." },
      { title: "Learning through play", body: "Outdoor time, art, music, and plenty of room for curiosity." },
      { title: "Always in the loop", body: "Daily photos and notes so you never miss a moment of their day." },
    ]),
    "home.features.items": JSON.stringify([
      { title: "A gentle daily rhythm", body: "Circle time, free play, outdoor time, rest, and snacks." },
      { title: "Room to explore", body: "Art, music, water play, and a garden to get muddy in." },
      { title: "Grown-ups who care", body: "A high staff ratio so every child gets real attention." },
    ]),
  },
};
