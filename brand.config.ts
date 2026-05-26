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
  storeName: "Teloz",
  storeSlug: "teloz",
  domain: "teloz.net",
  url: "https://teloz.net",
  tagline: "AI & Modern Commerce Agency",
  /**
   * Vælger seed-data-template (industry-templates/<slug>/).
   * Cartwright shipper "generic", "website-corporate", "coffee", "sunglasses",
   * og "agent-marketplace". Forks kan tilføje egne via industry-templates/index.ts.
   *
   * NB: "saas" er bevaret som legacy-alias for website-corporate så Teloz'
   * eksisterende deploy (med BrandingSettings.industryTemplate = "saas") fortsat
   * fungerer. Nye forks bør bruge "website-corporate" eksplicit.
   */
  industryTemplate: "saas",

  /**
   * Top-level mode: hvilken slags shop er dette? Drives også af industry-templates,
   * men eksplicit her for kode der vil branche på mode uden at læse template-slug.
   *
   *   "website"           — corporate/holding/marketing-site (Teloz). No cart.
   *   "webshop"           — full e-commerce GUI (Northbound, solbrillen.dk).
   *   "agent-marketplace" — pure A2A-shop. Backend-tunge endpoints + /admin.
   *
   * Hybrid (fx webshop + agent-marketplace endpoints) opnås via additive
   * features.* flags nedenfor.
   */
  mode: "website" as "website" | "webshop" | "agent-marketplace",

  /**
   * Deaktiver e-commerce features for agency/SaaS sites.
   *
   * @deprecated Foretræk `features.webshop` (samme semantik, ny placering).
   * Begge læses i en overgangsperiode; en kommende batch flytter alle
   * call sites til features.webshop og fjerner denne.
   */
  ecommerceEnabled: false,

  // ─── Contact ─────────────────────────────────────────────────────────────
  emails: {
    /** From-adresse for transactional mails (Resend skal være verified for dette domæne) */
    from: "noreply@teloz.net",
    /** Display-name vist før <from>-adressen i mail-klienter */
    fromName: "Teloz",
    /** Kunde-support */
    support: "support@teloz.net",
    /** Admin / interne notifikationer */
    admin: "admin@teloz.net",
  },

  // ─── SEO / metadata ──────────────────────────────────────────────────────
  metadata: {
    title: "Teloz Agency",
    description:
      "Vi bygger lynhurtige AI og e-commerce løsninger.",
    /** Open Graph + Twitter card image */
    socialImageUrl: "/og-image.png",
  },

  // ─── Logo-mærke ──────────────────────────────────────────────────────────
  // SVG-mærket vist BÅDE i header (components/Logo.tsx) og favicon (app/icon.tsx).
  // Begge læser herfra — ved klon redigeres KUN dette felt, så header + browser-
  // fane opdateres samlet. Alle paths tegnes som outline (stroke): i header arver
  // de tekstfarven (themeable), i faviconen tegnes de i faviconFg.
  logo: {
    /** viewBox for mark-SVG'en */
    markViewBox: "0 0 24 24",
    /** Tailwind-størrelse på mærket i header */
    markClass: "h-6 w-6",
    /** Stroke-bredde for alle paths */
    markStrokeWidth: 2,
    /** Valgfri transform på <g> der wrapper paths (fx tilt). "" = ingen. */
    markTransform: "",
    /** SVG path "d"-strings — tegnes som outline. */
    markPaths: [
      "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
    ],
    /** Favicon (app/icon.tsx): baggrunds-rektangel */
    faviconBg: "#1e3f5a",
    /** Favicon (app/icon.tsx): mærke-farve */
    faviconFg: "#f4efe6",
  },

  // ─── AI-assistant ────────────────────────────────────────────────────────
  ai: {
    /** Master switch — false for shops uden AI-assistance */
    enabled: true,
    /** Matcher filnavn i lib/ai/prompts/<promptModule>.ts */
    promptModule: "generic",
    /** Vist i aria-labels og header */
    assistantLabel: "AI assistant",
    /** Knapp-tekst på floating FAB */
    assistantOpenText: "Ask the AI assistant",
  },

  // ─── Feature-flags ───────────────────────────────────────────────────────
  features: {
    // ─── Mode-defining features (mirror brand.mode + ecommerceEnabled) ─────
    /**
     * Aktivér /[locale]/{produkter,kurv,checkout,produkt,kategori} routes
     * + add-to-cart UI. Skal matche brand.mode === "webshop" (eller hybrid).
     * Speciler brand.ecommerceEnabled på sigt.
     */
    webshop: false,
    /**
     * Aktivér Agentic Commerce Protocol checkout-endpoints
     * (/api/acp/v1/checkout_sessions/*, /api/acp/feed). Mirror af acp.enabled
     * nedenfor — én skifter, den anden er kompatibilitetsalias.
     */
    acp: false,
    /**
     * Aktivér Agent-to-Agent endpoints (/api/agent-card, /api/negotiate,
     * /api/escrow/verify). Kun true på agent-marketplace-template forks.
     * Eksponerer signed Agent Card + deterministic negotiation engine.
     */
    a2a: false,
    /**
     * Aktivér /admin/agentic dashboard (live A2A transactions, escrow queue,
     * provider toggle, policy editor). Kun nyttig hvis a2a eller acp er true.
     */
    adminAgenticDashboard: false,
    /**
     * Voice-shopping (Gemini Live). Compile-time gate — opt-in per shop.
     * Når true: VoiceShopMount renderes i [locale]/layout og tilbyder mic-FAB
     * hvis admin også har enabled voiceShop i /admin/integrations og sat
     * Google Gemini API-key. Default false så shops uden Gemini-budget ikke
     * eksponerer en knap der bare fejler.
     */
    voiceShop: false,

    // ─── Storefront UX features ────────────────────────────────────────────
    /** AR virtual try-on (eyewear-specifikt). False for cartwright-default. */
    tryOn: false,
    /** Storefront-AI-assistant FAB + panel */
    aiStylist: true,
    /** Footer-newsletter section */
    newsletter: true,
    /** Eksponér /api/mcp + /api/v1/tools offentligt (PR-signal for AI-first shops) */
    mcpPublic: true,
    /** Vis Cartwright referral-mærke i footeren */
    cartwrightBadge: true,
    /** First-visit welcome modal on the storefront (points new owners at /admin) */
    welcomeGuide: true,

    // ─── Phase 10: Compliance, Discovery & Media Intelligence ──────────────
    // Hver flag styrer ét delsystem. Default false → kode shipper, hver canary
    // flipper når dens slice er verificeret. Samme mønster som webshop/acp/a2a.
    /** Centralt MediaAsset-bibliotek + ProductMedia join. Læser via lib/media/shim.ts. */
    mediaLibrary: false,
    /** Gemini-drevet alt-text/SEO/GEO generation på upload (async via cron). */
    altTextAi: false,
    /** Cookie consent banner (3 kategorier, EU opt-in). Påkrævet for analyticsGa4. */
    consentBanner: false,
    /** GA4 script — loader KUN efter consentBanner=true og bruger har accepteret analytics. */
    analyticsGa4: false,
    /** ProductReview-system: indsendelse, moderation, render, post-purchase email, AggregateRating JSON-LD. */
    reviews: false,
    /** hreflang alternates på PDP + kategori. Auto-off ved single-locale shop. */
    hreflang: false,
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
    /** ISO-3166-1 alpha-2 land — bruges i shipping/return JSON-LD (Merchant Listing) */
    country: "DK",
  },

  // ─── Agentic Commerce Protocol (ACP) ─────────────────────────────────────
  // ACP-checkout-fladen (køb gennem ChatGPT m.fl.). Slået fra by default — en
  // fork aktiverer den bevidst når Stripe + ACP-checkout er klar.
  // Se cartwright-acp-v0.2-spec.md.
  acp: {
    /** Master-switch for ACP checkout-endpoints (/api/acp/v1/*). */
    enabled: false,
  },

  // ─── Footer ──────────────────────────────────────────────────────────────
  footer: {
    tagline:
      "Bygget med Cartwright Engine — en AI-drevet platform til moderne e-commerce og SaaS.",
    disclaimer: "Teloz ApS · CVR: Indsæt CVR · Alle rettigheder forbeholdes.",
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
    searchPlaceholder: "Search products...",
    searchAria: "Search products",
    allProductsLink: "All products",
    newsletterHeading: "Get store updates",
    newsletterSubtext:
      "Join the newsletter for product updates and launch offers.",
    tryOnHeading: "",
    tryOnSubtext: "",
    aiStylistFallbackHeading: "How can I help?",
    aiStylistPlaceholder:
      "Ask about products, orders, or recommendations...",
    notFoundProductsLink: "View all products",
    productsPageHeading: "All products",
    heroSubtagline:
      "A flexible storefront foundation ready for your brand, catalog, and AI workflows.",
    heroCta: "Shop products",
    categoryAllProductsBreadcrumb: "All products",
    productCardOriginBadge: "Curated selection",
    trustBadgesPrimary: "Fast delivery",
    pitchSectionHeading: "Built for modern commerce",
    pitchSectionBody:
      "A clean storefront, admin system, checkout flow, and AI tooling in one reusable template.",
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
