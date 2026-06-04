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
  if (!ecommerceEnabled) {
    if (industryTemplate === "saas") return "saas-dark";
    if (industryTemplate === "studio") return "studio";
    return "corporate-baseline";
  }
  return "webshop-classic";
}
