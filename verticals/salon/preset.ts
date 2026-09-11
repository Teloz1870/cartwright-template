import type { VerticalPreset } from "../types";

/** Salon / Spa — calm, polished, indulgent self-care voice. */
export const salonPreset: VerticalPreset = {
  slug: "salon",
  name: "Salon / Spa",
  description:
    "Calm, polished, indulgent voice for a hair salon, beauty, or spa business — relaxed luxury that makes booking feel like a treat.",
  keywords: ["salon", "spa", "hair", "beauty", "wellness", "barber", "nails", "luxury"],
  identity: { tone: "luxurious", audience: "consumer", formality: "balanced", vibe: "calm, polished, indulgent" },
  // v1: aurora-site is the Voice-aware website skin (see carpenter preset note).
  suggestedDesignSlug: "aurora-site",
  // Rose-gold luxe palette on charcoal + the glowing "orb" scene (premium core).
  palette: {
    accent: "#c9a36a",
    accentDeep: "#9a7b46",
    cream: "#faf7f2",
    sand: "#ece5db",
    ink: "#1b1a1c",
    muted: "#8a8079",
  },
  scene: "orb",
  genomeOverrides: {
    "home.hero.eyebrow": "By appointment",
    "home.hero.headline": "Look good, feel even better",
    "home.hero.tagline":
      "Expert cuts, colour, and care in a calm, unhurried space — leave looking and feeling like the best version of you.",
    "home.hero.cta": "Book now",
    "home.valueProps.title": "Your time, your style",
    "home.valueProps.description":
      "Senior stylists, premium products, and a relaxed chair that's all yours.",
    "home.features.title": "Our services",
    "home.features.description":
      "Cut, colour, balayage, and treatments — tailored to you in a single, unhurried visit.",
    "home.ctaFooter.title": "Treat yourself",
    "home.ctaFooter.description":
      "Book your chair online in seconds and let us take care of the rest.",
    "home.ctaFooter.cta": "Book now",
    "home.valueProps.items": JSON.stringify([
      { title: "Senior stylists", body: "Experienced hands who listen carefully before they cut." },
      { title: "Premium products", body: "Salon-grade care that's kind to your hair and your skin." },
      { title: "Unhurried time", body: "Your chair is yours — no rushing, just results you'll love." },
    ]),
    "home.features.items": JSON.stringify([
      { title: "Cut & style", body: "Precision cuts and blow-dries for every hair type." },
      { title: "Colour & balayage", body: "Rich colour, soft balayage, and gloss treatments." },
      { title: "Care & treatments", body: "Deep-conditioning and scalp treatments to finish." },
    ]),
  },
};
