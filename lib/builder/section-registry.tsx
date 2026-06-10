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
 * (presentational, sync, prop-driven). New entries must too.
 *
 * The catalog is grown additively (Magic Builder Phase 1). Newer atoms co-locate
 * their Zod schema + defaults in their own file (see StudioTestimonials); the
 * original few keep their schemas inline here.
 */
import type { ComponentType } from "react";
import { z } from "zod";
import { StudioHero } from "@/designs/studio/sections/StudioHero";
import { StudioFeatureGrid } from "@/designs/studio/sections/StudioFeatureGrid";
import { StudioCtaFooter } from "@/designs/studio/sections/StudioCtaFooter";
import { StudioHowItWorks } from "@/designs/studio/sections/StudioHowItWorks";
import { StudioStackGrid } from "@/designs/studio/sections/StudioStackGrid";
import {
  StudioTestimonials,
  testimonialsSchema,
  testimonialsDefaults,
} from "@/designs/studio/sections/StudioTestimonials";
import {
  StudioValuePropsData,
  valuePropsSchema,
  valuePropsDefaults,
} from "@/designs/studio/sections/StudioValuePropsData";
import {
  StudioPricingTable,
  pricingTableSchema,
  pricingTableDefaults,
} from "@/designs/studio/sections/StudioPricingTable";
import { StudioFaq, faqSchema, faqDefaults } from "@/designs/studio/sections/StudioFaq";
import {
  StudioLogoCloud,
  logoCloudSchema,
  logoCloudDefaults,
} from "@/designs/studio/sections/StudioLogoCloud";
import {
  StudioStatBand,
  statBandSchema,
  statBandDefaults,
} from "@/designs/studio/sections/StudioStatBand";
import {
  StudioSplitHero,
  splitHeroSchema,
  splitHeroDefaults,
} from "@/designs/studio/sections/StudioSplitHero";
import {
  StudioMediaHero,
  mediaHeroSchema,
  mediaHeroDefaults,
} from "@/designs/studio/sections/StudioMediaHero";
import {
  StudioGalleryGrid,
  galleryGridSchema,
  galleryGridDefaults,
} from "@/designs/studio/sections/StudioGalleryGrid";
import {
  StudioBannerCta,
  bannerCtaSchema,
  bannerCtaDefaults,
} from "@/designs/studio/sections/StudioBannerCta";
import {
  StudioFeatureSplit,
  featureSplitSchema,
  featureSplitDefaults,
} from "@/designs/studio/sections/StudioFeatureSplit";
import { StudioQuote, quoteSchema, quoteDefaults } from "@/designs/studio/sections/StudioQuote";
import {
  StudioNewsletterBlock,
  newsletterBlockSchema,
  newsletterBlockDefaults,
} from "@/designs/studio/sections/StudioNewsletterBlock";
import {
  StudioHeroAurora,
  heroAuroraSchema,
  heroAuroraDefaults,
} from "@/designs/studio/sections/StudioHeroAurora";
import {
  StudioBento,
  bentoSchema,
  bentoDefaults,
} from "@/designs/studio/sections/StudioBento";
import {
  StudioMarquee,
  marqueeSchema,
  marqueeDefaults,
} from "@/designs/studio/sections/StudioMarquee";
import {
  StudioConfigurator,
  configuratorSchema,
  configuratorDefaults,
} from "@/designs/studio/sections/StudioConfigurator";
import {
  StudioScrollStory,
  scrollStorySchema,
  scrollStoryDefaults,
} from "@/designs/studio/sections/StudioScrollStory";
import {
  StudioShowroom3D,
  showroom3dSchema,
  showroom3dDefaults,
} from "@/designs/studio/sections/StudioShowroom3D";
import {
  StudioCompare,
  compareSchema,
  compareDefaults,
} from "@/designs/studio/sections/StudioCompare";
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
  /**
   * Cartwright **Pro** Part — a premium, breakthrough element (e.g. the
   * configurator, scroll-cinema, 3D showroom). Surfaced with a "Pro" badge in
   * the builder + marketplace and associated with the `cartwrightPlus` tier
   * (honor-system; not hard-enforced). Default/undefined = free.
   */
  pro?: boolean;
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

// howItWorks + stackGrid genbruger eksisterende Studio-atomer hvis props
// allerede er serialiserbare (ingen ReactNode) — så de registreres med en
// inline data-schema her i stedet for en co-located.
const howItWorksPropsSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    steps: z
      .array(
        z.object({
          n: z.string().min(1),
          title: z.string().min(1),
          body: z.string().min(1),
          code: z.string().optional(),
        }),
      )
      .min(1)
      .max(6),
  })
  .strict();

const stackGridPropsSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    stack: z.array(z.string().min(1)).min(1).max(30),
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
 * DOM'en uanset hvordan props.html blev sat. Ingest-laget bruger den strengere
 * allowlist-sanitizer (sanitize-strict); denne render-sanitize er belt-and-braces.
 * Client-safe: ren, synkron, ingen server-only deps.
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
  heroAurora: defineSection({
    label: "3D-hero (Live Canvas)",
    propsSchema: heroAuroraSchema,
    defaultProps: heroAuroraDefaults,
    Component: StudioHeroAurora,
  }),
  splitHero: defineSection({
    label: "Split-hero (tekst + billede)",
    propsSchema: splitHeroSchema,
    defaultProps: splitHeroDefaults,
    Component: StudioSplitHero,
  }),
  mediaHero: defineSection({
    label: "Media-hero (baggrundsbillede)",
    propsSchema: mediaHeroSchema,
    defaultProps: mediaHeroDefaults,
    Component: StudioMediaHero,
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
  featureSplit: defineSection({
    label: "Feature-split (tekst + tjekliste + billede)",
    propsSchema: featureSplitSchema,
    defaultProps: featureSplitDefaults,
    Component: StudioFeatureSplit,
  }),
  valueProps: defineSection({
    label: "Værdi-kort (med ikoner)",
    propsSchema: valuePropsSchema,
    defaultProps: valuePropsDefaults,
    Component: StudioValuePropsData,
  }),
  howItWorks: defineSection({
    label: "Sådan virker det (trin)",
    propsSchema: howItWorksPropsSchema,
    defaultProps: {
      title: "Sådan kommer du i gang",
      steps: [
        { n: "1", title: "Vælg dine produkter", body: "Find det du har brug for i shoppen." },
        { n: "2", title: "Bestil sikkert", body: "Betal trygt med kort eller MobilePay." },
        { n: "3", title: "Få det leveret", body: "Hurtig levering direkte til døren." },
      ],
    },
    Component: StudioHowItWorks,
  }),
  stackGrid: defineSection({
    label: "Stak-grid (etiketter)",
    propsSchema: stackGridPropsSchema,
    defaultProps: {
      title: "Det arbejder vi med",
      stack: ["Bæredygtige materialer", "Lokal produktion", "Håndlavet", "Kvalitetssikret"],
    },
    Component: StudioStackGrid,
  }),
  statBand: defineSection({
    label: "Tal-bånd (statistik)",
    propsSchema: statBandSchema,
    defaultProps: statBandDefaults,
    Component: StudioStatBand,
  }),
  bento: defineSection({
    label: "Bento-grid (asymmetrisk)",
    propsSchema: bentoSchema,
    defaultProps: bentoDefaults,
    Component: StudioBento,
  }),
  marquee: defineSection({
    label: "Marquee (rullende bånd)",
    propsSchema: marqueeSchema,
    defaultProps: marqueeDefaults,
    Component: StudioMarquee,
  }),
  configurator: defineSection({
    label: "Konfigurator (byg-selv) ⭐ Pro",
    propsSchema: configuratorSchema,
    defaultProps: configuratorDefaults,
    Component: StudioConfigurator,
    pro: true,
  }),
  scrollStory: defineSection({
    label: "Scroll-historie (cinema) ⭐ Pro",
    propsSchema: scrollStorySchema,
    defaultProps: scrollStoryDefaults,
    Component: StudioScrollStory,
    pro: true,
  }),
  showroom3d: defineSection({
    label: "3D-showroom (Live Canvas) ⭐ Pro",
    propsSchema: showroom3dSchema,
    defaultProps: showroom3dDefaults,
    Component: StudioShowroom3D,
    pro: true,
  }),
  compare: defineSection({
    label: "Før/efter-slider ⭐ Pro",
    propsSchema: compareSchema,
    defaultProps: compareDefaults,
    Component: StudioCompare,
    pro: true,
  }),
  testimonials: defineSection({
    label: "Anmeldelser",
    propsSchema: testimonialsSchema,
    defaultProps: testimonialsDefaults,
    Component: StudioTestimonials,
  }),
  quote: defineSection({
    label: "Citat (pull-quote)",
    propsSchema: quoteSchema,
    defaultProps: quoteDefaults,
    Component: StudioQuote,
  }),
  pricingTable: defineSection({
    label: "Pris-tabel",
    propsSchema: pricingTableSchema,
    defaultProps: pricingTableDefaults,
    Component: StudioPricingTable,
  }),
  faq: defineSection({
    label: "FAQ (accordion)",
    propsSchema: faqSchema,
    defaultProps: faqDefaults,
    Component: StudioFaq,
  }),
  logoCloud: defineSection({
    label: "Logo-sky",
    propsSchema: logoCloudSchema,
    defaultProps: logoCloudDefaults,
    Component: StudioLogoCloud,
  }),
  galleryGrid: defineSection({
    label: "Galleri-grid",
    propsSchema: galleryGridSchema,
    defaultProps: galleryGridDefaults,
    Component: StudioGalleryGrid,
  }),
  bannerCta: defineSection({
    label: "Banner-CTA (fremhævet)",
    propsSchema: bannerCtaSchema,
    defaultProps: bannerCtaDefaults,
    Component: StudioBannerCta,
  }),
  newsletterBlock: defineSection({
    label: "Nyhedsbrev-blok",
    propsSchema: newsletterBlockSchema,
    defaultProps: newsletterBlockDefaults,
    Component: StudioNewsletterBlock,
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

/** Is this a Cartwright Pro (premium) Part? Drives the "Pro" badge + tier. */
export function isProSection(key: SectionKey): boolean {
  return SECTION_REGISTRY[key].pro === true;
}

/** All Pro Part keys — surfaced in the builder + marketplace with a Pro badge. */
export const PRO_SECTION_KEYS: SectionKey[] = (
  Object.keys(SECTION_REGISTRY) as SectionKey[]
).filter((k) => SECTION_REGISTRY[k].pro === true);
