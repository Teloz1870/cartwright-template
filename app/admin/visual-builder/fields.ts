/**
 * Visual Builder — inspector felt-metadata pr. section-key.
 *
 * Beskriver hvilke felter inspectoren rendrer for hver whitelisted sektion, og
 * af hvilken type. Holdt adskilt fra render-registry'et (lib/builder) fordi det
 * er en ren admin-UI-bekymring. Felt-navnene matcher hver sektions props-schema
 * (lib/builder/section-registry.tsx) 1:1 — en mismatch fanges af pages.set_layout
 * (Zod-validering) før noget gemmes.
 */
import type { SectionKey } from "@/lib/builder/section-registry";

export type FieldDef =
  | { name: string; label: string; type: "text" | "textarea"; optional?: boolean }
  | { name: string; label: string; type: "features" };

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
  featureGrid: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "title", label: "Titel", type: "text" },
    { name: "description", label: "Beskrivelse", type: "textarea", optional: true },
    { name: "features", label: "Features", type: "features" },
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
