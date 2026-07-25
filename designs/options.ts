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
    name: "Hoptify (Shopify pendant, parody)",
    description:
      "A familiar, clean webshop look à la the big platforms — but on the Cartwright engine, with a fresh Hoptify green and a twinkle in the eye (“Hop off Shopify”). Includes the parody import onboarding at /admin/hoptify.",
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
  {
    slug: "jungle",
    name: "Jungle (playful · nature)",
    description:
      "A friendly, organic website design — atom-composed and palette-adaptive, trimmed to the human sections (hero, value-props, features, CTA). A lush green palette + the waves scene read like a canopy. Great for kindergartens, cafés, wellness, and warm consumer brands.",
    mode: "website",
    premium: false,
  },
  // ───── Recognizable-aesthetic premium packs (code-built, locked theme, CSS-only)
  {
    slug: "aerospace",
    name: "Aerospace (cinematic deep-tech)",
    description:
      "Premium cinematic aerospace / mission-control website skin — near-black space canvas, one ice-blue accent, a dry technical voice. CSS starfield hero, condensed uppercase headlines, mono telemetry chips, a vehicle/systems fleet grid, a countdown mission-sequence timeline. Locked dark theme, no 3D.",
    mode: "website",
    premium: true,
  },
  {
    slug: "halo",
    name: "Halo (minimal product luxury)",
    description:
      "Premium ultra-minimal product-luxury storefront — light-grey canvas, oversized tight-tracked headlines, signature alternating full-bleed light / near-black panels, a pure-CSS hero device with a metallic sheen, one restrained product-blue accent, a tidy spec grid. Locked light theme, no 3D.",
    mode: "webshop",
    premium: true,
  },
  {
    slug: "flux",
    name: "Flux (vibrant gradient SaaS)",
    description:
      "Premium developer-first payments/infra SaaS design — white canvas, deep-navy text, one vivid indigo accent, a bold animated multi-hue gradient mesh with an angled clip, crisp white hairline cards, syntax-tinted mono code cards, a gradient stat band. Locked light theme, no 3D.",
    mode: "website",
    premium: true,
  },
  {
    slug: "drive",
    name: "Drive (full-bleed automotive)",
    description:
      "Premium full-bleed automotive / silent-luxury website skin — a vertical stack of full-viewport panels, each a beautiful atmospheric CSS backdrop with a centered top headline and bottom-anchored pill CTAs. Ultra-minimal, almost no body copy. Locked theme, no 3D.",
    mode: "website",
    premium: true,
  },
  {
    slug: "apex",
    name: "Apex (flagship · super-pro)",
    description:
      "The flagship super-pro webshop — one page composing a 3D hero, a 3D product showroom, value props, a build-your-own configurator, the live product grid, a scroll-cinema story and a CTA. Palette-adaptive: every section + Pro element adopts your brand palette. Complete out of the box.",
    mode: "webshop",
    premium: true,
  },
  {
    slug: "fable",
    name: "Fable (flagship · metamorphosis)",
    description:
      "The website-mode flagship — an airy ivory story page where an instanced flock of 3D butterflies flutters behind a serif display hero, a scroll-cinema metamorphosis timeline (caterpillar → chrysalis → imago), a stat band, a safeguards story and a CTA. Palette-adaptive: the whole flock and every section re-tone to your brand.",
    mode: "website",
    premium: true,
  },
  {
    slug: "stillwater",
    name: "Stillwater (calm enterprise)",
    description:
      "A calm-enterprise website design — from constant noise to quiet confidence. Fully generative landscapes (zero photos): layered SVG ridgelines with atmospheric perspective, mist and still water walk dawn → day → dusk → night behind huge Fraunces type, with the calm waves scene in the hero, oversized proof metrics, a star-lit night timeline and quiet testimonials. Palette-adaptive: the whole landscape re-tones to your brand.",
    mode: "website",
    premium: true,
  },
  {
    slug: "ember",
    name: "Ember (warm glow · soft tech)",
    description:
      "A warm-glow premium pack for site AND shop — a drifting pure-CSS gradient-mesh hero under bold Plus Jakarta Sans display type, cream cards lifted by soft terracotta glow shadows, an ink night-band of pulsing hand-drawn sparks, and a live featured-product grid in webshop mode. Palette-adaptive: the mesh, the glow and every EmberSpark re-tone to your brand.",
    mode: "both",
    premium: true,
  },
  {
    slug: "blank",
    name: "Blank Canvas (build from scratch)",
    description:
      "An intentionally bare starting point for a completely unique design. Minimal header, footer and homepage — heavily commented, made to be rewritten by you or your AI agent — while cart, checkout, admin, auth, AI tools and SEO keep working untouched. Neutral grayscale until you decide otherwise.",
    mode: "both",
    premium: false,
  },
];

/**
 * Page-Mixer — which skins accept swappable "Parts" (builder sections from
 * lib/builder/section-registry) and still look right?
 *
 * The Parts are **cw-\*** atoms (StudioHero/Bento/Marquee/…). A cw-\* Part only
 * inherits the active design's palette when that design's cw-\* tokens TRACK the
 * palette — true for the cw-prefix atom designs (aurora-site, aurora-shop,
 * studio, jungle) and for `applyPaletteAsTheme` packs that map palette onto cw-\*
 * too (hoptify). Every other pack owns a different token prefix (saas-*, nc-*,
 * at-*, st-*, bold-*, sol-*, eng-*, …) or a locked theme, so a cw-\* Part would
 * render in the DEFAULT cw palette — visually off. Those are "whole skins you
 * pick", NOT part-mix targets.
 *
 * Client-safe (pure data) — read by the Mixer, the Parts gallery manifest, and
 * the admin part-picker to grey out Parts on a non-mixable skin. Nothing on the
 * render path reads it, so canaries stay byte-identical.
 *
 * A DesignPack may override via its `mixable` field (designs/types.ts); for the
 * built-ins this slug set is the source of truth.
 */
export const MIXABLE_DESIGN_SLUGS: ReadonlySet<string> = new Set([
  "aurora-site",
  "aurora-shop",
  "studio",
  "jungle",
  "hoptify",
  "apex",
  "fable",
  "stillwater",
  "ember",
]);

export function designIsMixable(slug: string): boolean {
  return MIXABLE_DESIGN_SLUGS.has(slug);
}

/**
 * Effective mixability for a LOADED pack: the pack's own `mixable` field
 * (designs/types.ts — a DesignPack may override) wins when set; unset falls
 * back to the built-in slug set above. Same client-safe/pure-data contract as
 * `designIsMixable` — nothing on the live render path reads it.
 */
export function resolveMixable(slug: string, packMixable?: boolean): boolean {
  return packMixable ?? designIsMixable(slug);
}

/**
 * Does a loaded pack's RENDERING track an injected palette? (The question the
 * mixer-preview's locked-look notice asks — deliberately BROADER than Parts
 * mixability above.)
 *
 * `paletteToFullThemeCss` (lib/theme.ts) writes the palette onto the shared
 * `sol-*` + `cw-*` token families, so a pack is palette-adaptive when its
 * components read either family: `tokens.prefix === "sol"` (webshop-classic/
 * minimal/editorial, corporate-baseline, hoptify), `prefix === "cw"` (the
 * Aurora/atom packs + blank), an `applyPaletteAsTheme` pack, or a pack that
 * declares itself cw-coherent via `mixable`. Everything else owns a private
 * prefix (saas-*, at-*, halo-*, …) whose ACCENTS — the palette's visible
 * signature — the injected vars never reach: a "locked look". (A stray shared
 * token can still bleed through, e.g. webshop-bold's text reads cw-ink, but
 * that never recolors the design.) Note the asymmetry vs `designIsMixable`:
 * sol-prefix packs and `blank` track the PALETTE but are NOT Parts-mix targets.
 */
export function designTracksPalette(pack: {
  slug: string;
  mixable?: boolean;
  applyPaletteAsTheme?: boolean;
  tokens: { prefix: string };
}): boolean {
  return (
    pack.tokens.prefix === "sol" ||
    pack.tokens.prefix === "cw" ||
    pack.applyPaletteAsTheme === true ||
    resolveMixable(pack.slug, pack.mixable)
  );
}

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
