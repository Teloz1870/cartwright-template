/**
 * Visual Builder — section render-registry (the net-new core).
 *
 * Maps a whitelisted section `key` → { React-komponent, Zod props-schema,
 * default-props, label }. This is the deterministic chokepoint the whole
 * builder rests on:
 *
 *  - `section-schema.ts` validates each section-node's `props` against the
 *    matching entry's `propsSchema` (no arbitrary JSX — props only).
 *  - The render-seam (`InfoPage`) + the live-preview both render via this map,
 *    so storefront and preview can never diverge.
 *  - The inspector renders editable fields from each `propsSchema`.
 *
 * **Client-safety contract:** every Component here MUST be a pure presentational
 * component with NO server-only deps (no `import "server-only"`, `@/lib/db`,
 * `next/headers`) and NOT be `async` — because the preview route imports this
 * map into a client component. The Studio atoms reused below satisfy this
 * (verified: presentational, sync, prop-driven). New entries must too.
 *
 * Whitelist starts deliberately small (4 sections); extend additively.
 */
import type { ComponentType } from "react";
import { z } from "zod";
import { StudioHero } from "@/designs/studio/sections/StudioHero";
import { StudioFeatureGrid } from "@/designs/studio/sections/StudioFeatureGrid";
import { StudioCtaFooter } from "@/designs/studio/sections/StudioCtaFooter";
import { sanitizeVibeHtml } from "@/lib/v0/transform/sanitize";

/**
 * En section-definition binder propsSchema → Component-props-typen sammen, så
 * en mismatch (Component der ikke accepterer schemaets output) er en compile-
 * fejl. Mirror af `defineTool`-mønstret i lib/tools/types.ts.
 */
type SectionDef<S extends z.ZodType> = {
  label: string;
  propsSchema: S;
  defaultProps: z.infer<S>;
  Component: ComponentType<z.infer<S>>;
};

function defineSection<S extends z.ZodType>(def: SectionDef<S>): SectionDef<S> {
  return def;
}

// ─── Per-section props-schemas (mirror hver komponents Props nøjagtigt) ──────

const heroPropsSchema = z
  .object({
    eyebrow: z.string().optional(),
    headline: z.string().min(1),
    headlineAccent: z.string().optional(),
    tagline: z.string().min(1),
    ctaLabel: z.string().min(1),
    ctaHref: z.string().min(1),
    secondaryCtaLabel: z.string().optional(),
    secondaryCtaHref: z.string().optional(),
    microcopy: z.string().optional(),
  })
  .strict();

const featurePropsSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    features: z
      .array(z.object({ title: z.string().min(1), body: z.string().min(1) }))
      .min(1),
  })
  .strict();

const ctaFooterPropsSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    ctaLabel: z.string().min(1),
    ctaHref: z.string().min(1),
    secondaryCtaLabel: z.string().optional(),
    secondaryCtaHref: z.string().optional(),
  })
  .strict();

const richTextPropsSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().min(1),
  })
  .strict();

const vibePropsSchema = z
  .object({
    /** Saniteret HTML-streng (data, ikke kildekode). */
    html: z.string().min(1),
  })
  .strict();

/**
 * Simpel client-safe rich-text-sektion — title (h2) + afsnit adskilt af tomme
 * linjer. Bevidst minimal: section-tree skal kunne bære fri brødtekst uden at
 * afhænge af det server-side `renderContentBlocks`-modul.
 */
function RichTextSection({ title, body }: z.infer<typeof richTextPropsSchema>) {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      {title ? (
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h2>
      ) : null}
      <div className="space-y-4 leading-relaxed text-cw-stone-700 dark:text-cw-stone-300">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

/**
 * v0/AI-genereret fri-form sektion — broen mellem v0's HTML-output og builderens
 * section-tree. Bærer en HTML-streng som DATA (aldrig kildekode på disk). HTML'en
 * saniteres ALTID ved render (sidste forsvarslinje), så ingen malicious markup når
 * DOM'en uanset hvordan props.html blev sat. v0-transformen har allerede konverteret
 * className→class, så rå dangerouslySetInnerHTML rendrer korrekt. Client-safe: ren,
 * synkron, ingen server-only deps.
 */
function VibeSection({ html }: z.infer<typeof vibePropsSchema>) {
  return (
    <div
      className="cw-vibe-section"
      dangerouslySetInnerHTML={{ __html: sanitizeVibeHtml(html) }}
    />
  );
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const SECTION_REGISTRY = {
  hero: defineSection({
    label: "Hero",
    propsSchema: heroPropsSchema,
    defaultProps: {
      headline: "Din overskrift her",
      tagline: "En kort sætning der beskriver hvad I tilbyder.",
      ctaLabel: "Kom i gang",
      ctaHref: "/kontakt",
    },
    Component: StudioHero,
  }),
  featureGrid: defineSection({
    label: "Feature-grid",
    propsSchema: featurePropsSchema,
    defaultProps: {
      title: "Hvad vi tilbyder",
      features: [
        { title: "Funktion 1", body: "Beskriv fordelen her." },
        { title: "Funktion 2", body: "Beskriv fordelen her." },
        { title: "Funktion 3", body: "Beskriv fordelen her." },
      ],
    },
    Component: StudioFeatureGrid,
  }),
  ctaFooter: defineSection({
    label: "CTA-footer",
    propsSchema: ctaFooterPropsSchema,
    defaultProps: {
      title: "Klar til at starte?",
      ctaLabel: "Kontakt os",
      ctaHref: "/kontakt",
    },
    Component: StudioCtaFooter,
  }),
  richText: defineSection({
    label: "Brødtekst",
    propsSchema: richTextPropsSchema,
    defaultProps: {
      body: "Skriv dit indhold her.\n\nAdskil afsnit med en tom linje.",
    },
    Component: RichTextSection,
  }),
  vibe: defineSection({
    label: "AI-sektion (v0)",
    propsSchema: vibePropsSchema,
    defaultProps: {
      html:
        '<section class="px-6 py-16 text-center"><h2 class="text-2xl font-semibold">AI-genereret sektion</h2><p class="mt-2 text-stone-500">Brug “Generér med v0” i inspectoren, eller indsæt din egen HTML.</p></section>',
    },
    Component: VibeSection,
  }),
} as const;

export type SectionKey = keyof typeof SECTION_REGISTRY;

export function isSectionKey(key: string): key is SectionKey {
  return key in SECTION_REGISTRY;
}
