/**
 * v0.7.0 Design Registry — CLIENT-SAFE metadata.
 *
 * `designs/index.ts` importerer ALLE DesignPack-objekter inkl. deres
 * homepage-komponenter (som transitivt importerer server-only kode som
 * stripe.ts, prisma, etc.). Det fungerer fine for app/[locale]/page.tsx
 * (Server Component) men breaker Client Components der vil have list-data
 * til dropdowns (SetupWizard, /admin/designs).
 *
 * Denne fil eksporterer KUN flat metadata (slug, name, description, mode,
 * premium) + inferDesignFromIndustry — ingen React-komponenter eller
 * server-imports. Sikker at importere fra "use client"-filer.
 *
 * Ved tilføjelse af en ny design: append BÅDE her OG i designs/index.ts.
 * Codegen i PR I (lib/designs/codegen.ts) gør dette automatisk så manual
 * dual-update kun rammer hand-skrevne designs.
 */

export type DesignOption = {
  slug: string;
  name: string;
  description: string;
  mode: "website" | "webshop" | "both";
  premium: boolean;
};

export const DESIGN_OPTIONS: DesignOption[] = [
  {
    slug: "aurora-site",
    name: "Aurora — Website (Cartwright default)",
    description:
      "The flagship Cartwright website default. Light, airy, modern — built on the shared section atoms (same as the Magic Builder) and adopts your brand palette automatically.",
    mode: "website",
    premium: false,
  },
  {
    slug: "aurora-shop",
    name: "Aurora — Webshop (Cartwright default)",
    description:
      "The flagship Cartwright webshop default. Clean modern storefront — looping hero, featured products, trust row, category grid — adopts your brand palette automatically.",
    mode: "webshop",
    premium: false,
  },
  {
    slug: "saas-dark",
    name: "SaaS Dark (futurist / cyber)",
    description:
      "Dark bg with indigo accents, animated grid + glow, terminal code-snippet hero.",
    mode: "website",
    premium: false,
  },
  {
    slug: "studio",
    name: "Studio (tech / agency)",
    description:
      "Premium warm-tech design — terracotta + oker palette, Geist typography, CSS-only animations.",
    mode: "website",
    premium: true,
  },
  {
    slug: "corporate-baseline",
    name: "Corporate Baseline (generic website)",
    description:
      "Neutral cinematic-hero + 3-card service-grid for marketing sites.",
    mode: "website",
    premium: false,
  },
  {
    slug: "webshop-classic",
    name: "Webshop Classic (default e-commerce)",
    description:
      "HeroVideo + featured-product grid + lifestyle pitch + 5-col category grid.",
    mode: "webshop",
    premium: false,
  },
  {
    slug: "webshop-minimal",
    name: "Webshop Minimal (Apple-like)",
    description:
      "Full-bleed hero image + oversized typography + 2-col featured grid. Premium DTC-look — fewer, bigger products.",
    mode: "webshop",
    premium: false,
  },
  {
    slug: "webshop-editorial",
    name: "Webshop Editorial (magazine)",
    description:
      "Split-screen story-driven hero, alternating editorial product cards, typographic billboard categories. For story-led shops.",
    mode: "webshop",
    premium: true,
  },
  {
    slug: "webshop-bold",
    name: "Webshop Bold (neo-brutalism)",
    description:
      "High-contrast color-blocks + thick black borders + zero shadows. Inspired by DTC-modern and the brutalism web trend.",
    mode: "webshop",
    premium: true,
  },
  // ───── Cartwright Studio premium designs (sketch towards v0.8.0 marketplace)
  {
    slug: "northern-coffee",
    name: "Northern Coffee (Cartwright Studio)",
    description:
      "Story-first webshop for coffee roasters and specialty food shops. Warm Scandinavian minimalism with split-screen narrative hero, oversized today's-roast feature.",
    mode: "webshop",
    premium: true,
  },
  {
    slug: "atelier",
    name: "Atelier (Cartwright Studio)",
    description:
      "Museum-minimal luxury layout for fashion, jewelry, and leather goods. Monochrome with gold accent, ALL-CAPS sparse typography, full-bleed product photography.",
    mode: "webshop",
    premium: true,
  },
  {
    slug: "stack",
    name: "Stack (Cartwright Studio)",
    description:
      "Dark-mode-first developer-tools landing page. Terminal hero with typed command + animated output, code-block feature cards, monospace everywhere. For dev SaaS, AI APIs.",
    mode: "website",
    premium: true,
  },
  {
    slug: "hoptify",
    name: "Hoptify (Shopify-pendant, parodi)",
    description:
      "Et velkendt, rent webshop-look à la de store — men på Cartwright-motoren, med en frisk Hoptify-grøn og et glimt i øjet (“Hop off Shopify”). Inkl. parodi-import-onboarding i /admin/hoptify.",
    mode: "webshop",
    premium: false,
  },
  {
    slug: "engineered",
    name: "Engineered (dark-luxe agency)",
    description:
      "Premium dark-luxe agency design — navy + cream + mint-teal accent, three.js GLSL aurora hero, editorial type, glassmorphism, bento. Locked theme (no OS dark-mode flip). Built in real code.",
    mode: "website",
    premium: true,
  },
  {
    slug: "editorial-ink",
    name: "Editorial Ink (magazine / publication)",
    description:
      "Premium light editorial design — warm paper, deep ink, one restrained oxblood accent. Fraunces serif + Hanken Grotesk, drop-cap lede, big pull-quote, hairline rules. Locked light theme, no 3D.",
    mode: "website",
    premium: true,
  },
  {
    slug: "brutalist",
    name: "Brutalist (raw / mono)",
    description:
      "Premium neo-brutalist design — paper-white, hard black ink + thick borders, one acid-lime accent. Mono labels + bold grotesque, hard shadows, visible grid, marquee. Locked light theme, CSS-only.",
    mode: "website",
    premium: true,
  },
  {
    slug: "nocturne",
    name: "Nocturne (dark organic, 3D)",
    description:
      "Premium dark-organic luxe design — midnight aubergine + champagne gold + cream. Palette-driven 3D aurora hero, italic Fraunces display, organic shapes, soft glows, bento. Locked dark theme.",
    mode: "website",
    premium: true,
  },
  {
    slug: "meridian",
    name: "Meridian (crisp modern SaaS)",
    description:
      "Premium crisp-modern light SaaS design — cool neutrals + one electric-blue accent, CSS gradient-mesh hero, sharp bordered cards, mono labels, kbd-hint chips. Locked light theme, no 3D.",
    mode: "website",
    premium: true,
  },
];

/**
 * Backwards-compat inferens (samme logik som designs/index.ts —
 * dupliceret her så Client Components kan vise "Auto (xxx)" preview
 * uden at trække server-only kode ind).
 */
export function inferDesignFromIndustry(
  industryTemplate: string | null | undefined,
  ecommerceEnabled: boolean,
): string {
  // Cartwright flagship defaults. The palette-adaptive Aurora packs are the
  // out-of-box default for both modes; the older packs (saas-dark, studio,
  // corporate-baseline, webshop-classic, …) remain selectable alternatives via
  // an explicit BrandingSettings.designSlug. This also resolves the old
  // "webshop mode is industry-blind" problem: one palette-adaptive Aurora-shop
  // renders each vertical in its own brand colours instead of a fixed default.
  return ecommerceEnabled ? "aurora-shop" : "aurora-site";
}
