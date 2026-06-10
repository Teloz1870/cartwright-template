/**
 * v0.7.0 Design Registry — type-definitions.
 *
 * En "design" er et visuelt udtryk for en Cartwright-shop. Industry-template
 * (industry-templates/<slug>/) styrer seed-data (products, categories, pages).
 * Design styrer hvordan content RENDERES — homepage-komponent, palette,
 * typografi, optional PDP/category-layout-overrides for webshop-mode.
 *
 * De to akser er orthogonale: enhver industri kan kombineres med enhver
 * design (filtrered af mode — webshop-design fungerer ikke for website-only
 * shop og vice versa).
 *
 * Hver design lever i designs/<slug>/ og består af:
 *   - design.md       (canonical spec, importable/exportable)
 *   - index.ts        (DesignPack-objekt)
 *   - homepage.tsx    (homepage React component)
 *   - sections/*.tsx  (atom-komponenter, optional)
 *
 * Registry-konvention: `slug` skal være kebab-case og unique på tværs af
 * alle designs. Brug navne der er meningsfulde for kunden ("studio",
 * "webshop-minimal", "saas-dark"), ikke version-numre.
 */
import type { ComponentType, ReactNode } from "react";
import type { BrandingSettings, Product, Category } from "@/app/generated/prisma/client";
import type { ContentBlock } from "@/lib/content";

/** Products reach design homepages with a computed `imageUrl` (derived from media), not a raw Prisma column. */
export type DesignProduct = Product & { imageUrl?: string | null };

export type DesignMode = "website" | "webshop" | "both";

/**
 * Resolved homepage copy from the Genome (lib/genome) — passed in by
 * app/[locale]/page.tsx ONLY when brand.features.genomeResolve is on. Each value
 * is `override ?? resolved-cache ?? anchor`, where the anchor IS the matching
 * brand.website.* value — so a design that reads `genome?.x ?? brand.website.x`
 * renders byte-identical until a Voice preset / admin override sets a value.
 * Undefined when the flag is off (the byte-identical default).
 */
export type HomeGenomeCopy = {
  hero: { eyebrow: string; headline: string; tagline: string; cta: string };
  valueProps: { title: string; description: string };
  /** The value-prop CARDS (decoded from the home.valueProps.items list field).
   *  Empty when the field decodes to nothing → design falls back to brand.website. */
  valuePropsItems: { title: string; body: string }[];
  features: { title: string; description: string };
  /** The feature CARDS (decoded from home.features.items). Empty → fall back. */
  featuresItems: { title: string; body: string }[];
  ctaFooter: { title: string; description: string; cta: string };
  /** Webshop-mode hero + pitch copy (from the shop.* fields). Present only for
   *  webshop designs when genomeResolve is on; aurora-shop reads it as
   *  `genome?.shop?.heroTitle ?? brand.uiLabels.heroTitle` so flag-off is
   *  byte-identical. */
  shop?: {
    heroTitle: string;
    heroSubtagline: string;
    heroCta: string;
    pitchTitle: string;
    pitchBody: string;
  };
};

/**
 * Token-konfiguration for en design-pakke. Bruges til runtime CSS-variable
 * injection (lib/theme.ts:designToInlineCss) så designs kan ship'es uden
 * en separat themes/<slug>.css-fil — alt lever i design.md + DesignPack.
 *
 * Eksisterende themes/{generic,studio}.css-filer bevares som compile-time
 * fallback for designs der har komplekse @keyframes eller @utility-presets
 * (Studio's cw-grid-bg radial-mask osv.) som ikke kan udtrykkes inline.
 */
export type DesignTokens = {
  /**
   * Token-prefix uden bindestreg: "sol" → --color-sol-*, "cw" → --color-cw-*.
   * Skal være unique pr design så palette-overrides ikke kollidere.
   */
  prefix: string;
  /**
   * 6 core farver — mapper til existing lib/theme.ts:ThemePalette shape.
   * BrandingSettings.themeJson kan override disse pr-shop uden at skifte
   * design.
   */
  palette: {
    accent: string;
    accentDeep: string;
    cream: string;
    sand: string;
    ink: string;
    muted: string;
  };
  /**
   * Optional extra tokens — fx Studio's cw-terracotta, cw-oker, cw-stone-*.
   * Key er CSS-variable-navn UDEN ledende `--`. Værdi er en valid CSS-color-
   * eller -length-string.
   */
  extraTokens?: Record<string, string>;
  /**
   * Tailwind v4 @font-family-binding. Kun navnene; selve Next/font-loadingen
   * sker stadig i app/layout.tsx (Geist + Geist_Mono er allerede shop-wide).
   */
  fonts?: { sans?: string; mono?: string };
};

/**
 * Props som ALLE design-homepages modtager fra app/[locale]/page.tsx.
 * Designs vælger selv hvilke felter de bruger (fx website-mode designs
 * ignorerer featured/categories).
 */
export type DesignHomepageProps = {
  settings: BrandingSettings | null;
  locale: string;
  featured?: DesignProduct[];
  categories?: Category[];
  /**
   * Resolved Cartwright Live Canvas config (server-side). Design packs that
   * support a 3D hero render <ThreeHero> behind their hero when `enabled`.
   * Absent on packs/pages that don't resolve it → no 3D (gradient fallback).
   */
  threeD?: {
    enabled: boolean;
    scene: import("@/lib/three/types").SceneId;
    intensity: number;
  };
  /**
   * In-place editing (admin + annotateEdit-flag + standard-locale). Når true må
   * designet vedhæfte `data-cw-edit`-attributter på hero-copy (websiteHeadline/
   * tagline) via editAttr(). Default/undefined ⇒ ingen attributter. Designs der
   * rendrer hero fra brand.uiLabels (fx webshop-classic) understøtter ikke hero-
   * editing i v1 (ingen write-tool for uiLabels) og lader bare prop'en være.
   */
  editEnabled?: boolean;
  /**
   * Voice/Genome-resolved homepage copy (see HomeGenomeCopy). Present only when
   * brand.features.genomeResolve is on; undefined otherwise. Designs consume it
   * as `genome?.hero.headline ?? brand.website.headline` so render stays
   * byte-identical until a Voice preset / override exists.
   */
  genome?: HomeGenomeCopy;
};

/**
 * Optional layout-overrides for webshop-mode designs. Hvis ikke sat,
 * bruges shoppens default PDP/category-template uændret.
 */
export type WebshopOverrides = {
  productCard?: ComponentType<{ product: DesignProduct }>;
  pdpLayout?: ComponentType<{ product: DesignProduct; children: React.ReactNode }>;
  categoryLayout?: ComponentType<{ category: Category; children: React.ReactNode }>;
};

/**
 * Site-wide chrome a design can OWN so its look reaches every page, not just the
 * homepage. All optional → the render seam (app/[locale]/layout.tsx) falls back
 * to the shared Header/Footer and no wrapper, so a design that sets none of this
 * renders byte-identical to today.
 *
 * - `Shell` wraps ALL page content (chrome + body). A monolithic design uses it
 *   to apply its root class + `next/font` variables once, so the whole site (not
 *   just the homepage) is themed and the homepage stops being a fixed overlay.
 * - `Header` / `Footer` replace the shared chrome site-wide.
 */
export type DesignChromeProps = { locale: string };

export type DesignSiteChrome = {
  Shell?: ComponentType<{ children: ReactNode; locale: string }>;
  Header?: ComponentType<DesignChromeProps>;
  Footer?: ComponentType<DesignChromeProps>;
};

/** Props handed to a design's content-page template. */
export type DesignPageProps = { locale: string };

/**
 * Props for a design's generic CMS/info page template (FAQ, about, policies,
 * legal). `blocks` is the parsed markdown content (heading/paragraph/quote) — the
 * design renders them in its OWN prose style, inside its Shell + chrome. Only the
 * markdown-content render path uses this; builder layoutJson / vibeHtml pages
 * (explicitly authored) keep their own rendering.
 */
export type DesignInfoProps = DesignPageProps & { title: string; blocks: ContentBlock[] };

/**
 * Per-page-type templates a design can own (rendered inside its Shell + chrome).
 * All optional → each page's render seam falls back to the default body, so a
 * design only templates the pages it cares about. Webshop pages (PDP/PLP/cart)
 * stay on the existing `webshop` overrides below.
 */
export type DesignPages = {
  contact?: ComponentType<DesignPageProps>;
  info?: ComponentType<DesignInfoProps>;
  notFound?: ComponentType<DesignPageProps>;
};

export type DesignPack = {
  slug: string;
  name: string;
  description: string;
  mode: DesignMode;
  /**
   * Chrome-hint til delt header/footer: "dark" → mørk navigation + footer (fx
   * saas-dark, stack). Default/"light" → lyst chrome (Aurora, studio, webshop-*).
   * Header/Footer læser dette fra getActiveDesign() i stedet for at gætte ud fra
   * industryTemplate, så det altid matcher det aktive design.
   */
  chrome?: "light" | "dark";
  /**
   * Premium = "⭐ Pro" badge vises i SetupWizard når
   * brand.features.cartwrightPlus === false (honor-system MVP fra v0.6.0).
   * Design er teknisk valgbar uanset flag-tilstand.
   */
  premium?: boolean;
  /**
   * Source-of-truth design.md fil-path, relativ til designs/<slug>/.
   * Bruges af `npx cartwright design export <slug>` i PR I til at finde
   * canonical-spec'en igen.
   */
  source: string;
  /**
   * v0.9.4: sat på IMPORTEDE design.md-designs (drag-drop / `cartwright design
   * import`). Når true OG designet er aktivt, mapper app/layout.tsx designets
   * 6-color palette til BÅDE sol-* (chrome) OG cw-* (Studio-section atoms) core
   * tokens via paletteToFullThemeCss(), så hele shoppen adopterer designets
   * palette mens det er aktivt — uden filesystem-write (virker i prod) og uden
   * at røre built-in designs (de sætter ALDRIG dette flag → canaries upåvirket).
   * Override af BrandingSettings.themeJson vinder stadig hvis sat.
   */
  applyPaletteAsTheme?: boolean;
  /**
   * Page-Mixer hint: can swappable "Parts" (builder sections from
   * lib/builder/section-registry) be composed onto pages of this design and
   * still look right?
   *
   * TRUE for palette-adaptive skins (sol-* / applyPaletteAsTheme — Aurora,
   * jungle, webshop-*, …): they map any 6-colour palette onto the shared cw-*
   * atom tokens at runtime (paletteToFullThemeCss), so a cw-* Part inherits the
   * active skin's palette. FALSE for monolithic premium packs (own prefix, own
   * next/font, position:fixed, locked theme) — those are "whole skins you pick",
   * not part-mix targets.
   *
   * When unset, `designIsMixable()` (designs/options.ts) infers a sensible
   * default from prefix/applyPaletteAsTheme — so existing packs need no edit and
   * canaries stay byte-identical (nothing reads this on the render path yet; only
   * the Mixer / Parts gallery surfaces consult it).
   */
  mixable?: boolean;
  tokens: DesignTokens;
  homepage: ComponentType<DesignHomepageProps>;
  /**
   * Site-wide chrome (Shell/Header/Footer). When set, a design's look reaches
   * EVERY page — its homepage renders inside the Shell instead of as a fixed
   * overlay. Unset → shared chrome (default; byte-identical).
   */
  siteChrome?: DesignSiteChrome;
  /** Per-page-type templates (contact/info/notFound). Unset → default page body. */
  pages?: DesignPages;
  webshop?: WebshopOverrides;
};
