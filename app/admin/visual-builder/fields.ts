/**
 * Visual Builder — inspector felt-metadata pr. section-key.
 *
 * Beskriver hvilke felter inspectoren rendrer for hver whitelisted sektion, og
 * af hvilken type. Holdt adskilt fra render-registry'et (lib/builder) fordi det
 * er en ren admin-UI-bekymring. Felt-navnene matcher hver sektions props-schema
 * (lib/builder/section-registry.tsx) 1:1 — en mismatch fanges af pages.set_layout
 * (Zod-validering) før noget gemmes.
 *
 * Felt-typer:
 *  - text/textarea: skalar-strenge.
 *  - boolean: afkrydsningsfelt.
 *  - list: string[] (én pr. linje i en textarea).
 *  - features: det specifikke {title, body}[]-array (rig editor).
 *  - json: komplekse array/objekt-felter (redigeres som JSON; primært AI-udfyldt).
 */
import type { SectionKey } from "@/lib/builder/section-registry";

export type FieldDef =
  | { name: string; label: string; type: "text" | "textarea"; optional?: boolean }
  | { name: string; label: string; type: "boolean"; optional?: boolean }
  | { name: string; label: string; type: "list"; optional?: boolean }
  | { name: string; label: string; type: "features" }
  | { name: string; label: string; type: "json"; optional?: boolean };

export const SECTION_FIELDS: Record<SectionKey, FieldDef[]> = {
  hero: [
    { name: "eyebrow", label: "Eyebrow (lille badge)", type: "text", optional: true },
    { name: "headline", label: "Overskrift", type: "text" },
    { name: "headlineAccent", label: "Fremhævet del af overskrift", type: "text", optional: true },
    { name: "tagline", label: "Underrubrik", type: "textarea" },
    { name: "ctaLabel", label: "Knap-tekst", type: "text" },
    { name: "ctaHref", label: "Knap-link", type: "text" },
    { name: "secondaryCtaLabel", label: "Sekundær knap-tekst", type: "text", optional: true },
    { name: "secondaryCtaHref", label: "Sekundær knap-link", type: "text", optional: true },
    { name: "microcopy", label: "Microcopy under knapper", type: "text", optional: true },
  ],
  splitHero: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "headline", label: "Overskrift", type: "text" },
    { name: "body", label: "Brødtekst", type: "textarea" },
    { name: "ctaLabel", label: "Knap-tekst", type: "text", optional: true },
    { name: "ctaHref", label: "Knap-link", type: "text", optional: true },
    { name: "imageSrc", label: "Billed-URL", type: "text", optional: true },
    { name: "imageAlt", label: "Billed-alt-tekst", type: "text", optional: true },
    { name: "reverse", label: "Byt om på kolonner", type: "boolean", optional: true },
  ],
  mediaHero: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "headline", label: "Overskrift", type: "text" },
    { name: "tagline", label: "Underrubrik", type: "textarea", optional: true },
    { name: "imageSrc", label: "Baggrunds-billed-URL", type: "text" },
    { name: "imageAlt", label: "Billed-alt-tekst", type: "text" },
    { name: "ctaLabel", label: "Knap-tekst", type: "text", optional: true },
    { name: "ctaHref", label: "Knap-link", type: "text", optional: true },
  ],
  featureGrid: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "features", label: "Features", type: "features" },
  ],
  featureSplit: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "body", label: "Brødtekst", type: "textarea" },
    { name: "bullets", label: "Punkter (én pr. linje)", type: "list" },
    { name: "imageSrc", label: "Billed-URL", type: "text", optional: true },
    { name: "imageAlt", label: "Billed-alt-tekst", type: "text", optional: true },
    { name: "reverse", label: "Byt om på kolonner", type: "boolean", optional: true },
  ],
  valueProps: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "items", label: "Kort (title/body/icon)", type: "json" },
  ],
  howItWorks: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "steps", label: "Trin (n/title/body/code)", type: "json" },
  ],
  stackGrid: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "stack", label: "Etiketter (én pr. linje)", type: "list" },
  ],
  statBand: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text", optional: true },
    { name: "stats", label: "Tal (value/label)", type: "json" },
  ],
  testimonials: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "items", label: "Anmeldelser (quote/author/role)", type: "json" },
  ],
  quote: [
    { name: "quote", label: "Citat", type: "textarea" },
    { name: "author", label: "Forfatter", type: "text", optional: true },
    { name: "role", label: "Rolle/titel", type: "text", optional: true },
  ],
  pricingTable: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "plans", label: "Planer (JSON)", type: "json" },
  ],
  faq: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "items", label: "Spørgsmål (question/answer)", type: "json" },
  ],
  logoCloud: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text", optional: true },
    { name: "logos", label: "Logoer (name/src/href)", type: "json" },
  ],
  galleryGrid: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text", optional: true },
    { name: "items", label: "Billeder (src/alt/caption)", type: "json" },
  ],
  bannerCta: [
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "ctaLabel", label: "Knap-tekst", type: "text" },
    { name: "ctaHref", label: "Knap-link", type: "text" },
    { name: "secondaryCtaLabel", label: "Sekundær knap-tekst", type: "text", optional: true },
    { name: "secondaryCtaHref", label: "Sekundær knap-link", type: "text", optional: true },
  ],
  newsletterBlock: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "placeholder", label: "Placeholder-tekst", type: "text", optional: true },
    { name: "ctaLabel", label: "Knap-tekst", type: "text" },
  ],
  ctaFooter: [
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "ctaLabel", label: "Knap-tekst", type: "text" },
    { name: "ctaHref", label: "Knap-link", type: "text" },
    { name: "secondaryCtaLabel", label: "Sekundær knap-tekst", type: "text", optional: true },
    { name: "secondaryCtaHref", label: "Sekundær knap-link", type: "text", optional: true },
  ],
  richText: [
    { name: "title", label: "Overskrift", type: "text", optional: true },
    { name: "body", label: "Brødtekst (adskil afsnit med tom linje)", type: "textarea" },
  ],
  vibe: [
    { name: "html", label: "HTML (generér med v0 ovenfor, eller indsæt selv)", type: "textarea" },
  ],
};
