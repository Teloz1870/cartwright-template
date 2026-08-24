import type { VerticalPreset } from "../types";

/** Fitness / Gym — energetic but grounded "start where you are" studio voice. */
export const fitnessPreset: VerticalPreset = {
  slug: "fitness",
  name: "Fitness / Gym",
  description:
    "Energetic but grounded voice for a gym or training studio — encouraging coaching over posing, built around 'start where you are'.",
  keywords: ["gym", "fitness", "training", "workout", "classes", "membership", "strength", "yoga"],
  identity: { tone: "warm", audience: "consumer", formality: "casual", vibe: "energetic, encouraging, grounded" },
  // v1: aurora-site is the Voice-aware website skin (see carpenter preset note).
  suggestedDesignSlug: "aurora-site",
  // Strong ink + one crimson accent on cool near-white + the kinetic "gridflow" scene.
  palette: {
    accent: "#be123c",
    accentDeep: "#881337",
    cream: "#fafafa",
    sand: "#ededef",
    ink: "#18181b",
    muted: "#5d5d66",
  },
  scene: "gridflow",
  genomeOverrides: {
    "home.hero.eyebrow": "Start where you are",
    "home.hero.headline": "Stronger every week",
    "home.hero.tagline":
      "Classes, coaching, and a floor full of people who remember being beginners — train at your pace, with us beside you.",
    "home.hero.cta": "Try a free class",
    "home.valueProps.title": "Training that sticks",
    "home.valueProps.description":
      "No posing, no pressure — just good coaching, real progress, and a crew that shows up.",
    "home.features.title": "Find your class",
    "home.features.description":
      "Strength, conditioning, mobility, and open gym — morning, lunch, and evening, seven days a week.",
    "home.ctaFooter.title": "Your first class is free",
    "home.ctaFooter.description":
      "No contract, no sales pitch — come sweat with us once and see if it feels like home.",
    "home.ctaFooter.cta": "Try a free class",
    "home.valueProps.items": JSON.stringify([
      {
        title: "Coaches who coach",
        body: "Every class is led, corrected, and scaled to your level — never just supervised.",
      },
      {
        title: "Progress you can see",
        body: "We track your lifts and milestones so you can watch yourself get stronger.",
      },
      {
        title: "A no-ego floor",
        body: "Beginners welcome, personal records celebrated, equipment shared — that's the house rule.",
      },
    ]),
    "home.features.items": JSON.stringify([
      {
        title: "Strength & conditioning",
        body: "Barbell basics to big lifts — structured programs that build real strength.",
      },
      {
        title: "Classes all day",
        body: "HIIT, spin, mobility, and yoga — from the 6 am crew to the after-work rush.",
      },
      {
        title: "Open gym & PT",
        body: "Train on your own schedule, or book one-on-one coaching when you want a push.",
      },
    ]),
  },
};
