import type { VerticalPreset } from "../types";

/** Dentist — calm, trust-first voice for a dental clinic. */
export const dentistPreset: VerticalPreset = {
  slug: "dentist",
  name: "Dentist / Dental clinic",
  description:
    "Calm, trust-first voice for a dental clinic — gentle, modern dentistry that puts nervous patients at ease and makes booking feel safe.",
  keywords: ["dentist", "dental", "clinic", "teeth", "smile", "hygiene", "whitening", "orthodontics"],
  identity: { tone: "warm", audience: "consumer", formality: "balanced", vibe: "calm, gentle, reassuring" },
  // v1: aurora-site is the Voice-aware website skin (see carpenter preset note).
  suggestedDesignSlug: "aurora-site",
  // Clinical-calm palette (soft teal/blue on near-white) + the calm "waves" scene.
  palette: {
    accent: "#0e7490",
    accentDeep: "#155e75",
    cream: "#f7fbfc",
    sand: "#e4eef1",
    ink: "#16323a",
    muted: "#54707b",
  },
  scene: "waves",
  genomeOverrides: {
    "home.hero.eyebrow": "Gentle, modern dentistry",
    "home.hero.headline": "A calm visit, a confident smile",
    "home.hero.tagline":
      "From routine check-ups to whitening, we take the time to explain, reassure, and treat you gently — modern dentistry without the nerves.",
    "home.hero.cta": "Book an appointment",
    "home.valueProps.title": "Care you can relax into",
    "home.valueProps.description":
      "Clear prices, gentle hands, and honest advice — we only recommend the treatment you actually need.",
    "home.features.title": "Our treatments",
    "home.features.description":
      "Everything for a healthy mouth — routine care, cosmetic touches, and same-day help when something hurts.",
    "home.ctaFooter.title": "Your smile is in good hands",
    "home.ctaFooter.description":
      "Book online in under a minute — and if you are nervous, tell us. We will take it at your pace.",
    "home.ctaFooter.cta": "Book an appointment",
    "home.valueProps.items": JSON.stringify([
      {
        title: "Gentle by default",
        body: "Numbing options, soft pacing, and breaks whenever you need one — nervous patients are our specialty.",
      },
      {
        title: "Clear, honest pricing",
        body: "You see the full price before any treatment starts — no surprises on the invoice.",
      },
      {
        title: "Modern equipment",
        body: "Digital X-rays and 3D scans mean faster visits, lower doses, and better diagnoses.",
      },
    ]),
    "home.features.items": JSON.stringify([
      {
        title: "Check-ups & hygiene",
        body: "Routine examinations and professional cleaning that keep small problems small.",
      },
      {
        title: "Whitening & veneers",
        body: "Gentle cosmetic treatments for a brighter, natural-looking smile.",
      },
      {
        title: "Acute care",
        body: "Toothache or a chipped tooth? We keep same-day slots for emergencies.",
      },
    ]),
  },
};
