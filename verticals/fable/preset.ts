import type { VerticalPreset } from "../types";

/**
 * Fable — the Claude Fable 5 launch announcement as a Voice.
 *
 * Copy is drawn verbatim-faithfully from Anthropic's June 9, 2026 announcement
 * (capabilities, safeguards, pricing, Mythos/Glasswing) and arranged as a
 * metamorphosis: wild form → chrysalis → emergence. Pairs with the "fable"
 * Skin + the palette-reactive "butterflies" scene for the full launch vibe.
 */
export const fablePreset: VerticalPreset = {
  slug: "fable",
  name: "Fable (model launch)",
  description:
    "The Fable 5 launch story as a voice — metamorphic, luminous announcement copy for Anthropic's most capable generally available model.",
  keywords: ["ai", "launch", "model", "metamorphosis", "butterfly", "announcement"],
  identity: {
    tone: "technical",
    audience: "general",
    formality: "balanced",
    vibe: "metamorphic, luminous, precise",
  },
  suggestedDesignSlug: "fable",
  // Iridescent indigo on ivory — chrysalis light, not generic tech-dark.
  palette: {
    accent: "#4e4af2",
    accentDeep: "#2f2bb8",
    cream: "#faf7f0",
    sand: "#f0ebdf",
    ink: "#23201c",
    muted: "#7d776c",
  },
  scene: "butterflies",
  genomeOverrides: {
    "home.hero.eyebrow": "Introducing",
    "home.hero.headline": "Meet Fable 5",
    "home.hero.tagline":
      "Anthropic's most capable generally available model — a Mythos-class model made safe for general use, and state-of-the-art on nearly all tested AI benchmarks.",
    "home.hero.cta": "Read the story",
    "home.valueProps.title": "What Fable 5 brings",
    "home.valueProps.description":
      "Capability, safety, and availability — the three facts of the launch, stated plainly.",
    "home.features.title": "Three stages of becoming",
    "home.features.description":
      "The scroll story in miniature: from the wild Mythos form, through the chrysalis of safeguards, to the model that takes wing.",
    "home.ctaFooter.title": "Emerge with Fable 5",
    "home.ctaFooter.description":
      "Launched June 9, 2026. Included on Pro, Max, Team, and Enterprise plans through June 22.",
    "home.ctaFooter.cta": "Try Fable 5",
    "home.valueProps.items": JSON.stringify([
      {
        title: "Capability, compounded",
        body: "State-of-the-art on nearly all tested benchmarks — at Stripe it compressed months of engineering into days, and its novel protein-design hypotheses were preferred about 80% over prior models.",
      },
      {
        title: "Safe by construction",
        body: "Queries on cybersecurity, biology and chemistry, or distillation fall back to Claude Opus 4.8 — triggered in under 5% of sessions. 1,000+ hours of external red-teaming found no universal jailbreaks.",
      },
      {
        title: "Available today",
        body: "$10 per million input tokens, $50 per million output tokens. Included on Pro, Max, Team, and Enterprise plans through June 22.",
      },
    ]),
    "home.features.items": JSON.stringify([
      {
        title: "Mythos, the wild form",
        body: "The same underlying model with safeguards lifted in some areas — restricted to cyberdefenders and infrastructure partners via Project Glasswing, and selected biology researchers.",
      },
      {
        title: "The chrysalis",
        body: "A Mythos-class model made safe for general use: sensitive queries hand off to Claude Opus 4.8, and over a thousand hours of red-teaming found no universal jailbreaks.",
      },
      {
        title: "Fable takes wing",
        body: "Exceptional at software engineering, knowledge work, and vision — rebuilding web apps from screenshots and holding focus across millions of tokens with persistent memory.",
      },
    ]),
  },
};
