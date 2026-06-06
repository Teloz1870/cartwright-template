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
import type { ComponentType } from "react";
import type { BrandingSettings, Product, Category } from "@/app/generated/prisma/client";

/** Products reach design homepages with a computed `imageUrl` (derived from media), not a raw Prisma column. */
type DesignProduct = Product & { imageUrl?: string | null };

export type DesignMode = "website" | "webshop" | "both";

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

export type DesignPack = {
  slug: string;
  name: string;
  description: string;
  mode: DesignMode;
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
  tokens: DesignTokens;
  homepage: ComponentType<DesignHomepageProps>;
  webshop?: WebshopOverrides;
};
