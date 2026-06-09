import { z } from "zod";
import { brand } from "@/brand.config";
import type { Resolvable, GenomeDeps } from "./types";
import type { CopyFieldSpec } from "./resolvers/copy-field";
import { encodeItems, itemsJsonSchema } from "./list";

/**
 * Genome-feltregister — den eneste allowlist for hvilke felter der må
 * overrides/resolves via genomeJson (samme filosofi som RUNTIME_TOGGLEABLE_KEYS
 * i lib/feature-flags/manifest.ts). Et resolvable felt = én data-entry: anker
 * (= den nuværende statiske brand.config-værdi, så flag-off er identisk), lock,
 * dependsOn, schema, label og en spec. At tilføje et felt er DATA, ikke en ny
 * resolver-funktion — det er det uniforme primitiv.
 *
 * `satisfies` tjekker hver entry mod Resolvable<string> OG lader os udlede den
 * præcise GenomeFieldKey-union herfra — ingen håndvedligeholdt key-liste.
 */

/**
 * Byg en copy-resolver fra en spec. Dynamisk import holder AI-SDK'en UDE af
 * render-stiens statiske graf (read.ts → fields.ts): readField pulls aldrig
 * `ai`/lib/ai/client ind. Type-only import af CopyFieldSpec erases ved compile.
 */
function copyResolver(spec: CopyFieldSpec): (deps: GenomeDeps) => Promise<string> {
  return async (deps) => {
    const { resolveCopyField } = await import("./resolvers/copy-field");
    return resolveCopyField(spec, deps);
  };
}

const FIELDS = {
  "footer.tagline": {
    anchor: brand.footer.tagline,
    lock: "resolvable",
    dependsOn: ["tone"],
    schema: z.string().min(10).max(220),
    label: "Footer-tagline",
    resolver: copyResolver({
      label: "footer tagline",
      purpose:
        "the one-line tagline under the logo in the site footer — sums up what the brand stands for",
      minLength: 10,
      maxLength: 220,
    }),
  },

  // Anchored (lock-bit demo): juridisk/identitets-tekst må ALDRIG LLM-omskrives
  // (risiko for fabrikeret CVR/selskabsnavn). Ingen resolver → readField
  // returnerer kun override ?? anker. Admin kan stadig overskrive (fx sætte
  // det rigtige CVR), men intet AI rører den.
  "footer.disclaimer": {
    anchor: brand.footer.disclaimer,
    lock: "anchored",
    dependsOn: [],
    schema: z.string().min(5).max(300),
    label: "Footer-disclaimer",
  },

  "uiLabels.newsletterHeading": {
    anchor: brand.uiLabels.newsletterHeading,
    lock: "resolvable",
    dependsOn: ["tone", "vibe"],
    schema: z.string().min(3).max(60),
    label: "Newsletter-overskrift",
    resolver: copyResolver({
      label: "newsletter heading",
      purpose: "the heading above the footer newsletter signup form",
      minLength: 3,
      maxLength: 60,
    }),
  },

  "uiLabels.newsletterSubtext": {
    anchor: brand.uiLabels.newsletterSubtext,
    lock: "resolvable",
    dependsOn: ["tone", "vibe"],
    schema: z.string().min(10).max(200),
    label: "Newsletter-undertekst",
    resolver: copyResolver({
      label: "newsletter subtext",
      purpose:
        "the one-sentence subtext under the footer newsletter heading inviting signup",
      minLength: 10,
      maxLength: 200,
    }),
  },

  // ── Homepage copy (website-mode) ──────────────────────────────────────────
  // Voice-resolvable hero/section copy. Anchors = the current brand.website.*
  // values, so flag-off (or no override/resolved-cache) renders byte-identical.
  // The aurora-site orchestrator reads these as `genome?.x ?? brand.website.x`.
  "home.hero.eyebrow": {
    anchor: brand.website.eyebrow,
    lock: "resolvable",
    dependsOn: ["tone", "vibe"],
    schema: z.string().min(2).max(48),
    label: "Hero-eyebrow (forside)",
    resolver: copyResolver({
      label: "homepage hero eyebrow",
      purpose: "the small eyebrow label above the homepage hero headline",
      minLength: 2,
      maxLength: 48,
    }),
  },
  "home.hero.headline": {
    anchor: brand.website.headline,
    lock: "resolvable",
    dependsOn: ["tone", "vibe"],
    schema: z.string().min(6).max(90),
    label: "Hero-overskrift (forside)",
    resolver: copyResolver({
      label: "homepage hero headline",
      purpose:
        "the main homepage hero headline — the brand's core promise in a few punchy words",
      minLength: 6,
      maxLength: 90,
    }),
  },
  "home.hero.tagline": {
    anchor: brand.website.tagline,
    lock: "resolvable",
    dependsOn: ["tone", "vibe", "audience"],
    schema: z.string().min(20).max(300),
    label: "Hero-tagline (forside)",
    resolver: copyResolver({
      label: "homepage hero tagline",
      purpose:
        "the hero sub-tagline under the headline — 1-2 sentences expanding the promise for the audience",
      minLength: 20,
      maxLength: 300,
    }),
  },
  "home.hero.cta": {
    anchor: brand.website.cta,
    lock: "resolvable",
    dependsOn: ["tone"],
    schema: z.string().min(2).max(32),
    label: "Hero-knap (forside)",
    resolver: copyResolver({
      label: "homepage hero CTA",
      purpose: "the primary call-to-action button label on the homepage hero",
      minLength: 2,
      maxLength: 32,
    }),
  },
  "home.valueProps.title": {
    anchor: brand.website.valuePropsTitle,
    lock: "resolvable",
    dependsOn: ["tone", "vibe"],
    schema: z.string().min(6).max(90),
    label: "Værdi-sektion overskrift",
    resolver: copyResolver({
      label: "value-props section title",
      purpose: "the section title above the homepage value-propositions block",
      minLength: 6,
      maxLength: 90,
    }),
  },
  "home.valueProps.description": {
    anchor: brand.website.valuePropsDescription,
    lock: "resolvable",
    dependsOn: ["tone", "vibe", "audience"],
    schema: z.string().min(10).max(300),
    label: "Værdi-sektion beskrivelse",
    resolver: copyResolver({
      label: "value-props section description",
      purpose: "the one-paragraph intro under the value-propositions title",
      minLength: 10,
      maxLength: 300,
    }),
  },
  "home.features.title": {
    anchor: brand.website.featuresTitle,
    lock: "resolvable",
    dependsOn: ["tone", "vibe"],
    schema: z.string().min(6).max(90),
    label: "Feature-sektion overskrift",
    resolver: copyResolver({
      label: "features section title",
      purpose: "the section title above the homepage features block",
      minLength: 6,
      maxLength: 90,
    }),
  },
  "home.features.description": {
    anchor: brand.website.featuresDescription,
    lock: "resolvable",
    dependsOn: ["tone", "vibe", "audience"],
    schema: z.string().min(10).max(300),
    label: "Feature-sektion beskrivelse",
    resolver: copyResolver({
      label: "features section description",
      purpose: "the one-paragraph intro under the features title",
      minLength: 10,
      maxLength: 300,
    }),
  },
  "home.ctaFooter.title": {
    anchor: brand.website.ctaFooterTitle,
    lock: "resolvable",
    dependsOn: ["tone", "vibe"],
    schema: z.string().min(6).max(90),
    label: "CTA-footer overskrift",
    resolver: copyResolver({
      label: "closing CTA title",
      purpose: "the headline of the closing call-to-action band at the bottom of the homepage",
      minLength: 6,
      maxLength: 90,
    }),
  },
  "home.ctaFooter.description": {
    anchor: brand.website.ctaFooterDescription,
    lock: "resolvable",
    dependsOn: ["tone", "vibe", "audience"],
    schema: z.string().min(10).max(300),
    label: "CTA-footer beskrivelse",
    resolver: copyResolver({
      label: "closing CTA description",
      purpose: "the one-sentence subtext under the closing call-to-action title",
      minLength: 10,
      maxLength: 300,
    }),
  },
  "home.ctaFooter.cta": {
    anchor: brand.website.ctaFooterCtaLabel,
    lock: "resolvable",
    dependsOn: ["tone"],
    schema: z.string().min(2).max(32),
    label: "CTA-footer knap",
    resolver: copyResolver({
      label: "closing CTA button label",
      purpose: "the button label in the closing call-to-action band",
      minLength: 2,
      maxLength: 32,
    }),
  },

  // List fields (JSON-encoded): the homepage CARD grids. Anchored (no LLM
  // resolver) — a Voice preset overrides them with on-voice cards; otherwise they
  // decode to the current brand.website.* → byte-identical.
  "home.valueProps.items": {
    anchor: encodeItems(brand.website.valueProps.map((v) => ({ title: v.title, body: v.body }))),
    lock: "anchored",
    dependsOn: [],
    schema: itemsJsonSchema,
    label: "Værdi-kort (forside)",
  },
  "home.features.items": {
    anchor: encodeItems(brand.website.features.map((f) => ({ title: f.title, body: f.body }))),
    lock: "anchored",
    dependsOn: [],
    schema: itemsJsonSchema,
    label: "Feature-kort (forside)",
  },
} satisfies Record<string, Resolvable<string>>;

export const GENOME_FIELDS: Record<GenomeFieldKey, Resolvable<string>> = FIELDS;

export type GenomeFieldKey = keyof typeof FIELDS;

export const GENOME_FIELD_KEYS: ReadonlySet<GenomeFieldKey> = new Set(
  Object.keys(FIELDS) as GenomeFieldKey[],
);

export function isGenomeFieldKey(key: string): key is GenomeFieldKey {
  return GENOME_FIELD_KEYS.has(key as GenomeFieldKey);
}

export function getField(key: GenomeFieldKey): Resolvable<string> {
  return GENOME_FIELDS[key];
}
