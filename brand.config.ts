/**
 * Brand-config: single source of truth for alt brand-specifikt i denne shop.
 *
 * Ved klon til ny niche-shop (panel-hegn, sømosegaard, etc.): rediger KUN
 * denne fil + themes/<slug>.css + lib/ai/prompts/<slug>.ts. Se FORK_GUIDE.md.
 *
 * Pure-data modul — INGEN runtime-imports af lib/ eller components/ for at
 * undgå circular-import. Andre filer importerer brand fra hér, ikke omvendt.
 */

export const brand = {
  // ─── Identity ────────────────────────────────────────────────────────────
  storeName: "Cartwright Demo Store",
  storeSlug: "cartwright-demo",
  domain: "example.com",
  url: "https://example.com",
  tagline: "A configurable commerce template",
  /**
   * Vælger seed-data-template (industry-templates/<slug>/).
   * Cartwright shipper kun "generic". Forks tilføjer egne templates ved at
   * registrere dem i industry-templates/index.ts.
   */
  industryTemplate: "generic",

  // ─── Contact ─────────────────────────────────────────────────────────────
  emails: {
    /** From-adresse for transactional mails (Resend skal være verified for dette domæne) */
    from: "noreply@example.com",
    /** Display-name vist før <from>-adressen i mail-klienter */
    fromName: "Cartwright Demo Store",
    /** Kunde-support */
    support: "support@example.com",
    /** Admin / interne notifikationer */
    admin: "admin@example.com",
  },

  // ─── SEO / metadata ──────────────────────────────────────────────────────
  metadata: {
    title: "Cartwright Demo Store",
    description:
      "A standalone AI-ready commerce template built with Next.js, Prisma, Stripe, and MCP tools.",
    /** Open Graph + Twitter card image */
    socialImageUrl: "/og-image.png",
  },

  // ─── AI-assistant ────────────────────────────────────────────────────────
  ai: {
    /** Master switch — false for shops uden AI-assistance */
    enabled: true,
    /** Matcher filnavn i lib/ai/prompts/<promptModule>.ts */
    promptModule: "generic",
    /** Vist i aria-labels og header */
    assistantLabel: "AI-assistent",
    /** Knapp-tekst på floating FAB */
    assistantOpenText: "Spørg AI-assistenten",
  },

  // ─── Feature-flags ───────────────────────────────────────────────────────
  features: {
    /** AR virtual try-on (eyewear-specifikt). False for cartwright-default. */
    tryOn: false,
    /** Storefront-AI-assistant FAB + panel */
    aiStylist: true,
    /** Footer-newsletter section */
    newsletter: true,
    /** Eksponér /api/mcp + /api/v1/tools offentligt (PR-signal for AI-first shops) */
    mcpPublic: true,
  },

  // ─── Policies ────────────────────────────────────────────────────────────
  policies: {
    /** Gratis-fragt-threshold i øre (DKK default — opdater ved currency-skift) */
    shippingFreeThresholdDkk: 49900,
    /** Default fragt i øre */
    shippingDefaultDkk: 4900,
    /** Returret-vindue */
    returnDays: 30,
    /** ISO-4217 currency code — DKK / EUR / USD / etc. */
    currency: "DKK",
  },

  // ─── Footer ──────────────────────────────────────────────────────────────
  footer: {
    tagline:
      "A flexible commerce foundation ready for your brand, catalog, and AI workflows.",
    disclaimer: "Demo store — replace this text before production.",
    copyrightYear: 2026,
  },

  // ─── Image-defaults ──────────────────────────────────────────────────────
  // Bruges når DB-felt (fx Category.heroImage) er null
  images: {
    hero: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1600",
    lifestyle:
      "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=1200",
    scenic:
      "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49?w=1600",
    /** Per-slug kategori-billede-fallback. Cartwright-fork tilføjer egne mappings. */
    categoryFallbacks: {
      featured:
        "https://images.unsplash.com/photo-1556740758-90de374c12ad?w=800",
      essentials:
        "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800",
      accessories:
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800",
    } as Record<string, string>,
  },

  // ─── Stripe Elements appearance ──────────────────────────────────────────
  // Stripe-Elements render i iframe og kan IKKE læse CSS-variabler fra
  // parent-document. Ved palette-skift skal disse opdateres manuelt så de
  // matcher den nye theme/<slug>.css palette.
  stripeAppearance: {
    colorPrimary: "#1e3f5a",
    colorBackground: "#ffffff",
    colorText: "#1a1a1a",
    colorDanger: "#dc2626",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    borderRadius: "10px",
  },

  // ─── UI-labels ───────────────────────────────────────────────────────────
  // Tekst-strings vist i frontend. Ved fork: oversæt/erstat de domæne-
  // specifikke værdier ("produkt" → "hegn"/"keramik" osv.) så shoppen ikke
  // står med fremmede produktnavne i header/footer/søgning.
  uiLabels: {
    searchPlaceholder: "Søg produkter…",
    searchAria: "Søg produkter",
    allProductsLink: "Alle produkter",
    newsletterHeading: "Få opdateringer fra butikken",
    newsletterSubtext:
      "Tilmeld dig nyhedsbrevet og få produkt-opdateringer + launch-tilbud.",
    tryOnHeading: "",
    tryOnSubtext: "",
    aiStylistFallbackHeading: "Hvordan kan jeg hjælpe?",
    aiStylistPlaceholder:
      "Spørg om produkter, ordrer eller anbefalinger…",
    notFoundProductsLink: "Se alle produkter",
    productsPageHeading: "Alle produkter",
    heroSubtagline:
      "En fleksibel storefront-foundation klar til dit brand, katalog og AI-workflows.",
    heroCta: "Shop produkter",
    categoryAllProductsBreadcrumb: "Alle produkter",
    productCardOriginBadge: "Curated selection",
    trustBadgesPrimary: "Hurtig levering",
    pitchSectionHeading: "Bygget til moderne commerce",
    pitchSectionBody:
      "Ren storefront, admin-system, checkout-flow og AI-tooling samlet i én genbrugelig template.",
  },

  // ─── Email palette (HTML-emails) ─────────────────────────────────────────
  // Centraliseret hér frem for find/replace i 3 filer ved fork. Palette skal
  // manuelt synces med themes/<slug>.css ved palette-ændring.
  emailColors: {
    accent: "#1e3f5a",
    cream: "#f4efe6",
    sand: "#e8e1d3",
    ink: "#1a1a1a",
    muted: "#726d62",
    success: "#1e3f5a",
  },
} as const;

export type Brand = typeof brand;
