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
import type { ContentBlock } from "@/lib/content";

/**
 * B3 (site-profile slice): the design contract is STRUCTURAL, not ORM-bound.
 * Designs receive data *shapes* — the Prisma rows the db-profile pages pass
 * satisfy these by structural typing, and a no-DB `site` materialization can
 * satisfy them from config/static sources. Do NOT import Prisma types here:
 * `@/app/generated/prisma/client` does not exist in a scaffold without the
 * db module, and this file ships in EVERY profile.
 *
 * The field lists cover exactly what design packs consume today (audited
 * 2026-07-15). A design that needs a new field adds it here — tsc on the full
 * engine then proves the db pages still satisfy the widened contract.
 */

/** The settings-row subset design homepages read (DB override layer; null without a DB). */
export type DesignSettings = {
  storeName?: string | null;
  tagline?: string | null;
  websiteHeadline?: string | null;
  heroCta?: string | null;
  heroImage?: string | null;
  announcement?: string | null;
};

/**
 * The product shape design packs (and the shared ProductGrid/ProductCard)
 * render. Wide enough for the whole card chain — image resolution
 * (`lib/media/shim`), price/variant display, stock badge — while staying
 * structural: a Prisma Product row satisfies it as-is.
 */
export type DesignProduct = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  /** Price in minor units (øre) — matches the engine's priceDkk column. */
  priceDkk: number;
  /** JSON-encoded image-URL array (the engine's `images` column shape). */
  images: string;
  stock?: number | null;
  featured?: boolean;
  brand?: string | null;
  videoUrl?: string | null;
  variants?: Array<{ priceDkk: number }>;
  productMedia?: Array<{
    position: number;
    asset: { url: string; altDa: string | null; altEn: string | null };
  }>;
  translations?: unknown;
  imageUrl?: string | null;
};

/** The category subset designs render (teaser rows, category layouts). */
export type DesignCategory = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  image?: string | null;
  heroImage?: string | null;
  translations?: unknown;
};

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
   *
   * `display` (Mixer 2.0 Phase 4, additive): optional display/heading-family
   * hint. Emitted som `--font-display` af designToInlineCss; de design-adaptive
   * surfaces (components/surfaces/DesignSurface.tsx) læser den som
   * `var(--font-display, inherit)` på headings, så et premium-design kan give
   * kurv/checkout/konto sin display-typografi uden egne templates. Unset →
   * ingen variabel emittes (byte-identisk).
   */
  fonts?: { sans?: string; mono?: string; display?: string };
};

/**
 * Props som ALLE design-homepages modtager fra app/[locale]/page.tsx.
 * Designs vælger selv hvilke felter de bruger (fx website-mode designs
 * ignorerer featured/categories).
 */
export type DesignHomepageProps = {
  settings: DesignSettings | null;
  locale: string;
  /**
   * Whether this materialized profile and the resolved runtime brand both
   * expose the public agent API. Designs must use this instead of assuming
   * that MCP/OpenAPI/admin routes ship in every scaffold profile.
   */
  agentApiEnabled?: boolean;
  featured?: DesignProduct[];
  categories?: DesignCategory[];
  /**
   * Resolved Cartwright Live Canvas config (server-side). Design packs that
   * support a 3D hero render <ThreeHero> behind their hero when `enabled`.
   * Absent on packs/pages that don't resolve it → no 3D (gradient fallback).
   */
  threeD?: {
    enabled: boolean;
    scene: import("@/lib/three/scene-ids").SceneId;
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
  categoryLayout?: ComponentType<{ category: DesignCategory; children: React.ReactNode }>;
  /**
   * Mixer 2.0 Phase 4 (additive): wrapper around the PLP (/produkter) body so a
   * design can own the listing-page frame (hero band, filters chrome, …) the
   * same way pdpLayout/categoryLayout wrap PDP/category. Consumed only when
   * brand.features.designSurfaces is on; unset → default PLP (byte-identical).
   * No built-in pack implements this yet.
   */
  plpLayout?: ComponentType<{ children: React.ReactNode }>;
  /**
   * Set true when this design's `pdpLayout` already renders its OWN visible
   * breadcrumb. The route-level breadcrumb (brand.features.breadcrumbs, in
   * app/[locale]/product/[slug]/page.tsx) then skips PDP so the two don't
   * double up. Unset/false → the shared breadcrumb renders when the flag is on.
   */
  ownsBreadcrumb?: boolean;
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
export type DesignChromeProps = {
  locale: string;
  /** Runtime + materialized-profile capability, threaded by the locale layout. */
  agentApiEnabled?: boolean;
  /** False in the no-database `site` profile, where `/admin` is absent. */
  accountAndAdminEnabled?: boolean;
};

export type DesignSiteChrome = {
  Shell?: ComponentType<{ children: ReactNode; locale: string }>;
  Header?: ComponentType<DesignChromeProps>;
  Footer?: ComponentType<DesignChromeProps>;
};

/** Props handed to a design's content-page template. */
export type DesignPageProps = { locale: string };

/** Public CMS/default copy available to contact templates that want it. */
export type DesignContactProps = DesignPageProps & {
  title?: string;
  blocks?: ContentBlock[];
};

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
  contact?: ComponentType<DesignContactProps>;
  info?: ComponentType<DesignInfoProps>;
  notFound?: ComponentType<DesignPageProps>;
  /**
   * Mixer 2.0 Phase 4 (additive): wrapper templates for the transactional
   * surfaces. Same contract style as webshop.pdpLayout — the page renders its
   * default (token-adaptive) body and hands it to the design as `children`, so
   * a flagship pack can own the frame (typography, ornament, layout) without
   * re-implementing cart math/forms. Consumed only when
   * brand.features.designSurfaces is on; unset → default body (byte-identical).
   * No built-in pack implements these yet.
   */
  cart?: ComponentType<DesignPageProps & { children: ReactNode }>;
  checkout?: ComponentType<DesignPageProps & { children: ReactNode }>;
  account?: ComponentType<DesignPageProps & { children: ReactNode }>;
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
   * When unset, the answer is `designIsMixable()` (designs/options.ts) — a
   * STATIC set of built-in slugs, not an inference from prefix or
   * `applyPaletteAsTheme`. So a built-in pack needs no edit, while a pack you
   * write yourself is outside that set: set this field, or add your slug to
   * MIXABLE_DESIGN_SLUGS. `resolveMixable(slug, pack.mixable)` is the combined
   * answer — but note the two routes are NOT equivalent everywhere: the
   * portable-composition path (lib/compositions/spec.ts + export.ts) answers
   * from the slug set alone, by design, so only the slug-set route survives
   * into an exported composition.
   *
   * Who reads it: `designTracksPalette` (the mixer-preview locked-look notice)
   * and — via `isChromeSelectable` — which chrome Parts a shop may pick and
   * keep. That second one reaches the render path (lib/theme.ts drops a saved
   * chrome that is not selectable on the active design), so changing this field
   * on a LIVE shop can change which header/footer renders. Every pack the
   * ENGINE ships resolves to the same answer it did before that wiring existed,
   * pinned by an engine-only invariant in tests/unit/chrome-registry.test.ts
   * (it deliberately does not run in your project — your packs are yours to
   * override). Not yet expressible through
   * `cartwright-design-v1` — an imported pack needs this added by hand.
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
  /**
   * Optional control over the shared content wrapper. The render seam
   * (app/[locale]/layout.tsx) wraps every page body in
   * `<main className="min-h-[60vh]">` by default. Unset → byte-identical.
   *
   * Use this when a design needs to own the page rhythm — e.g. a full-bleed
   * landing with no min-height, a fullscreen hero, or a Shell-based pack that
   * renders its own `<main>` (then set `ownsMain` so the engine doesn't add a
   * second, nested `<main>` landmark).
   */
  layout?: {
    /**
     * Override the class on the engine's `<main>`. `""` drops the min-height for
     * a full-bleed page; e.g. `"min-h-screen"` for a fullscreen hero. Ignored
     * when `ownsMain` is true. Default `"min-h-[60vh]"`.
     */
    mainClassName?: string;
    /**
     * When true the engine renders NO `<main>` wrapper on ANY page — the design
     * owns the `<main>` landmark itself. Render it in the SHELL (not the
     * homepage) so content pages keep the landmark too — e.g. Drive's Shell
     * renders `<main className="drv__wrap">` around every page. The design MUST
     * render exactly one `<main>` so the landmark isn't lost. Default false.
     */
    ownsMain?: boolean;
  };
  /** Per-page-type templates (contact/info/notFound). Unset → default page body. */
  pages?: DesignPages;
  webshop?: WebshopOverrides;
};
