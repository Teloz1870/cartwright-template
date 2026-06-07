import { z } from "zod";
import { brand } from "@/brand.config";
import type { Resolvable, GenomeDeps } from "./types";
import type { CopyFieldSpec } from "./resolvers/copy-field";

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
