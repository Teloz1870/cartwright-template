/**
 * Visual Builder — inspector felt-metadata pr. section-key.
 *
 * Describes which fields the inspector renders for each whitelisted section, and
 * of what type. Kept separate from the render registry (lib/builder) because it
 * is a pure admin-UI concern. The field names match each section's props schema
 * (lib/builder/section-registry.tsx) 1:1 — a mismatch is caught by pages.set_layout
 * (Zod validation) before anything is saved.
 *
 * Felt-typer:
 *  - text/textarea: skalar-strenge.
 *  - boolean: afkrydsningsfelt.
 *  - list: string[] (én pr. linje i en textarea).
 *  - features: the specific {title, body}[] array (rich editor).
 *  - json: complex array/object fields (edited as JSON; mostly AI-filled).
 */
import type { SectionKey } from "@/lib/builder/section-registry";

export type FieldDef =
  | { name: string; label: string; type: "text" | "textarea"; optional?: boolean }
  | { name: string; label: string; type: "number"; optional?: boolean }
  | { name: string; label: string; type: "boolean"; optional?: boolean }
  | { name: string; label: string; type: "list"; optional?: boolean }
  | { name: string; label: string; type: "features" }
  | { name: string; label: string; type: "json"; optional?: boolean };

export const SECTION_FIELDS: Record<SectionKey, FieldDef[]> = {
  hero: [
    { name: "eyebrow", label: "Eyebrow (small badge)", type: "text", optional: true },
    { name: "headline", label: "Headline", type: "text" },
    { name: "headlineAccent", label: "Highlighted part of headline", type: "text", optional: true },
    { name: "tagline", label: "Subheading", type: "textarea" },
    { name: "ctaLabel", label: "Button text", type: "text" },
    { name: "ctaHref", label: "Button link", type: "text" },
    { name: "secondaryCtaLabel", label: "Secondary button text", type: "text", optional: true },
    { name: "secondaryCtaHref", label: "Secondary button link", type: "text", optional: true },
    { name: "microcopy", label: "Microcopy under buttons", type: "text", optional: true },
  ],
  heroAurora: [
    { name: "eyebrow", label: "Eyebrow (small badge)", type: "text", optional: true },
    { name: "headline", label: "Headline", type: "text" },
    { name: "headlineAccent", label: "Highlighted part of headline", type: "text", optional: true },
    { name: "tagline", label: "Subheading", type: "textarea" },
    { name: "ctaLabel", label: "Button text", type: "text" },
    { name: "ctaHref", label: "Button link", type: "text" },
    { name: "secondaryCtaLabel", label: "Secondary button text", type: "text", optional: true },
    { name: "secondaryCtaHref", label: "Secondary button link", type: "text", optional: true },
    { name: "microcopy", label: "Microcopy under buttons", type: "text", optional: true },
    {
      name: "scene",
      label: "3D scene (aurora · waves · orb · gridflow · blob · particles · wireframe · floating-geometry)",
      type: "text",
    },
  ],
  splitHero: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "headline", label: "Headline", type: "text" },
    { name: "body", label: "Body text", type: "textarea" },
    { name: "ctaLabel", label: "Button text", type: "text", optional: true },
    { name: "ctaHref", label: "Button link", type: "text", optional: true },
    { name: "imageSrc", label: "Image URL", type: "text", optional: true },
    { name: "imageAlt", label: "Image alt text", type: "text", optional: true },
    { name: "reverse", label: "Swap columns", type: "boolean", optional: true },
  ],
  mediaHero: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "headline", label: "Headline", type: "text" },
    { name: "tagline", label: "Subheading", type: "textarea", optional: true },
    { name: "imageSrc", label: "Background image URL", type: "text" },
    { name: "imageAlt", label: "Image alt text", type: "text" },
    { name: "ctaLabel", label: "Button text", type: "text", optional: true },
    { name: "ctaHref", label: "Button link", type: "text", optional: true },
  ],
  featureGrid: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "features", label: "Features", type: "features" },
  ],
  featureSplit: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "body", label: "Body text", type: "textarea" },
    { name: "bullets", label: "Punkter (én pr. linje)", type: "list" },
    { name: "imageSrc", label: "Billed-URL", type: "text", optional: true },
    { name: "imageAlt", label: "Billed-alt-tekst", type: "text", optional: true },
    { name: "reverse", label: "Swap columns", type: "boolean", optional: true },
  ],
  valueProps: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "items", label: "Cards (title/body/icon)", type: "json" },
  ],
  howItWorks: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "steps", label: "Steps (n/title/body/code)", type: "json" },
  ],
  stackGrid: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "stack", label: "Labels (one per line)", type: "list" },
  ],
  statBand: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text", optional: true },
    { name: "stats", label: "Tal (value/label)", type: "json" },
  ],
  bento: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text", optional: true },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "tiles", label: "Tiles (kicker/title/body — first is featured)", type: "json" },
  ],
  marquee: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "items", label: "Tekster (én pr. linje)", type: "list" },
    { name: "speed", label: "Hastighed (slow · normal · fast)", type: "text" },
  ],
  configurator: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "productName", label: "Product name", type: "text" },
    { name: "basePrice", label: "Grundpris", type: "number" },
    { name: "currency", label: "Valuta-symbol", type: "text" },
    { name: "groups", label: "Valg-grupper (label/kind/choices — JSON)", type: "json" },
    { name: "ctaLabel", label: "Button text", type: "text" },
    { name: "ctaHref", label: "Knap-link", type: "text" },
    { name: "note", label: "Note under knappen", type: "text", optional: true },
  ],
  scrollStory: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "frames", label: "Beats (kicker/headline/body — JSON)", type: "json" },
  ],
  compare: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text", optional: true },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "beforeLabel", label: "Before label", type: "text" },
    { name: "afterLabel", label: "Efter-label", type: "text" },
    { name: "beforeSrc", label: "Before image URL", type: "text", optional: true },
    { name: "afterSrc", label: "Efter-billede URL", type: "text", optional: true },
  ],
  showroom3d: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "productName", label: "Product name", type: "text" },
    { name: "tagline", label: "Underrubrik", type: "text", optional: true },
    {
      name: "scene",
      label: "3D-scene (orb · blob · aurora · waves · gridflow · particles · wireframe · floating-geometry)",
      type: "text",
    },
    { name: "intensity", label: "Intensitet (0-1)", type: "number", optional: true },
    { name: "specs", label: "Specs (label/value — JSON)", type: "json" },
    { name: "ctaLabel", label: "Button text", type: "text", optional: true },
    { name: "ctaHref", label: "Knap-link", type: "text", optional: true },
  ],
  testimonials: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "items", label: "Reviews (quote/author/role)", type: "json" },
  ],
  quote: [
    { name: "quote", label: "Citat", type: "textarea" },
    { name: "author", label: "Forfatter", type: "text", optional: true },
    { name: "role", label: "Rolle/titel", type: "text", optional: true },
  ],
  pricingTable: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "plans", label: "Plans (JSON)", type: "json" },
  ],
  faq: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "items", label: "Questions (question/answer)", type: "json" },
  ],
  logoCloud: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text", optional: true },
    { name: "logos", label: "Logoer (name/src/href)", type: "json" },
  ],
  galleryGrid: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text", optional: true },
    { name: "items", label: "Billeder (src/alt/caption)", type: "json" },
  ],
  bannerCta: [
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "ctaLabel", label: "Button text", type: "text" },
    { name: "ctaHref", label: "Knap-link", type: "text" },
    { name: "secondaryCtaLabel", label: "Secondary button text", type: "text", optional: true },
    { name: "secondaryCtaHref", label: "Secondary button link", type: "text", optional: true },
  ],
  newsletterBlock: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "placeholder", label: "Placeholder text", type: "text", optional: true },
    { name: "ctaLabel", label: "Button text", type: "text" },
  ],
  ctaFooter: [
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea", optional: true },
    { name: "ctaLabel", label: "Button text", type: "text" },
    { name: "ctaHref", label: "Knap-link", type: "text" },
    { name: "secondaryCtaLabel", label: "Secondary button text", type: "text", optional: true },
    { name: "secondaryCtaHref", label: "Secondary button link", type: "text", optional: true },
  ],
  richText: [
    { name: "title", label: "Overskrift", type: "text", optional: true },
    { name: "body", label: "Body text (separate paragraphs with a blank line)", type: "textarea" },
  ],
  vibe: [
    { name: "html", label: "HTML (generate with v0 above, or paste your own)", type: "textarea" },
  ],
};
