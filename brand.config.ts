/**
 * Brand-config: single source of truth for alt brand-specifikt i denne shop.
 *
 * Ved klon til ny niche-shop (panel-hegn, sømosegaard, etc.): rediger KUN
 * denne fil + themes/<slug>.css + lib/ai/prompts/<slug>.ts. Se FORK_GUIDE.md.
 *
 * Pure-data modul — INGEN runtime-imports af lib/ eller components/ for at
 * undgå circular-import. Andre filer importerer brand fra hér, ikke omvendt.
 * (`import type` er OK — typer slettes ved compile og kan ikke skabe cycles.)
 */
import type { SceneId } from "@/lib/three/scene-ids";

export const brand = {
  // ─── Identity ────────────────────────────────────────────────────────────
  storeName: "Cartwright",
  storeSlug: "cartwright",
  domain: "cartwright.app",
  url: "https://cartwright.app",
  tagline: "The AI-first site & commerce engine",
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
   * Optional explicit design pack (the visual homepage design). This is the
   * trusted, identity-safe way to pick a premium design — CONFIG, not DB — so it
   * wins over inference in BOTH website- and webshop-mode (website-mode locks
   * identity to brand.config, and the design is cosmetic, so it's safe here).
   * Leave undefined to infer the flagship default (Aurora). Browse packs in
   * /admin/designs or on cartwright.app. Example: designSlug: "engineered".
   */
  designSlug: undefined as string | undefined,

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
   * Who owns this site's identity (storeName + ecommerceEnabled): this file, or
   * the admin database?
   *
   * - "auto"   — today's behaviour: website mode locks identity to config,
   *              webshop mode lets the DB win. Byte-identical to pre-v0.42.
   * - "config" — identity is sovereign from brand.config in EVERY mode. Pick
   *              this if your site is configured in code (AI-built, in git) and
   *              the admin is used for operations only. Stops an unrelated
   *              admin action from renaming the site.
   * - "db"     — the DB wins in both modes (multi-tenant / white-label).
   *
   * Deliberately NOT a features.* flag: those are runtime-toggleable from the
   * database, and a protection a contaminated database can switch off is not a
   * protection. See lib/identity.ts.
   *
   * The default is "config" because a Cartwright site starts life in code: this
   * file is the first thing the scaffolder writes and the first thing an AI
   * agent edits. Under "config" the store name and the webshop toggle live here
   * and the admin shows them as locked, with the reason.
   *
   * PREFER TO MANAGE IDENTITY IN THE ADMIN? Set this to "auto" (or "db") and
   * those two fields become editable there again. Nothing else changes — the
   * sovereign set is deliberately just those two; tagline, logo, theme, domain
   * and emails are DB-owned under every policy.
   */
  identitySovereignty: "config" as "auto" | "config" | "db",

  /**
   * Deaktiver e-commerce features for agency/SaaS sites.
   *
   * @deprecated Foretræk `features.webshop` (samme semantik, ny placering).
   * Begge læses i en overgangsperiode; en kommende batch flytter alle
   * call sites til features.webshop og fjerner denne.
   */
  ecommerceEnabled: false,

  // ─── Sprog / i18n ─────────────────────────────────────────────────────────
  /**
   * `locales` er alle understøttede locale-koder; `defaultLocale` er base-
   * sproget — kildeteksten i DB-felter, og det getDynamicTranslation behandler
   * som "ingen oversættelse nødvendig". i18n/routing.ts læser disse, så en klon
   * kun redigerer her for at tilføje fx tysk: ["da", "en", "de"]. Et enkelt
   * element ⇒ single-locale shop (hreflang slås automatisk fra).
   */
  locales: ["da", "en"] as const,
  defaultLocale: "da",

  // ─── Contact ─────────────────────────────────────────────────────────────
  emails: {
    /** From-adresse for transactional mails (Resend skal være verified for dette domæne) */
    from: "noreply@cartwright.app",
    /** Display-name vist før <from>-adressen i mail-klienter */
    fromName: "Cartwright",
    /** Kunde-support */
    support: "support@cartwright.app",
    /** Admin / interne notifikationer */
    admin: "admin@cartwright.app",
  },

  // ─── SEO / metadata ──────────────────────────────────────────────────────
  metadata: {
    title: "Cartwright",
    description:
      "The build engine AIs reach for — a real site with design, database and backend, live in minutes.",
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
    /** Favicon (app/icon.tsx): baggrunds-rektangel — Cartwright vermilion */
    faviconBg: "#c33f16",
    /** Favicon (app/icon.tsx): mærke-farve */
    faviconFg: "#ffffff",
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
     * UCP identity-linking (dev.ucp.common.identity_linking): OAuth 2.0
     * Authorization-Code + PKCE så agenter kan handle på en brugers vegne på
     * tværs af merchants. Default-off. Kør db:push (OAuthClient/OAuthAuthCode/
     * OAuthToken) før aktivering — se docs/HUL-D-UCP-IDENTITY-LINKING.md.
     */
    ucpIdentityLinking: false,
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
    /**
     * WebMCP: storefront-handlinger som browser-native tools til in-browser
     * AI-agenter (document.modelContext). EKSPERIMENTELT (Chrome-only origin-
     * trial, W3C-draft) — default-off, hold af canary-mosaikken.
     */
    webMcp: false,
    /** Vis Cartwright referral-mærke i footeren */
    cartwrightBadge: true,
    /** First-visit welcome modal on the storefront (points new owners at /admin) */
    welcomeGuide: true,
    /**
     * First-run welcome canvas: full-page Cartwright showcase rendered on the
     * homepage of a truly untouched scaffold (no design chosen, no copy set,
     * no products, setup not completed — see lib/first-run.ts). Disappears
     * permanently the moment the site is made its own. Engine default false —
     * the canaries are structurally immune; `npx create-cartwright` flips it
     * true on fresh scaffolds. While enabled it also suppresses the
     * WelcomeGuide modal (app/[locale]/layout.tsx).
     */
    firstRunWelcome: false,
    /**
     * Phone.inc click-to-call/chat-widget (gated mount). Default false per
     * "don't ship default-on" — ikke alle shops vil have et telefon-widget.
     * Tidligere altid-på når ecommerceEnabled; nu eget runtime-toggleable flag
     * (kan tændes pr. shop i /admin/features). Canary-paritet: Northbound +
     * Solbrillen sætter true i deres brand.config-overlay.
     */
    phoneWidget: false,
    /**
     * Promo-announcement-bar i toppen. Default false (mange website-shops vil
     * ikke have den). Tidligere altid-på når ecommerceEnabled; nu eget runtime-
     * toggleable flag med ecommerce-precondition. Canary-paritet: Northbound +
     * Solbrillen sætter true i deres brand.config-overlay.
     */
    announcementBar: false,
    /**
     * Synlige breadcrumbs på storefront-sider (kategori, alle-produkter, ydelser,
     * blog). Default false → byte-identisk render indtil tændt. Runtime-toggleable
     * i /admin/features. Den synlige sti afspejler den BreadcrumbList-JSON-LD
     * siderne allerede emitter (samme trail-data, ingen ny URL-logik).
     */
    breadcrumbs: false,

    // ─── Phase 10: Compliance, Discovery & Media Intelligence ──────────────
    // Hver flag styrer ét delsystem. Default false → kode shipper, hver canary
    // flipper når dens slice er verificeret. Samme mønster som webshop/acp/a2a.
    /** Centralt MediaAsset-bibliotek + ProductMedia join. Læser via lib/media/shim.ts. */
    mediaLibrary: false,
    /** Gemini-drevet alt-text/SEO/GEO generation på upload (async via cron). */
    altTextAi: false,
    /**
     * AI-triage af indkomne leads (prioritet + resumé + svarudkast), kørt EFTER
     * svaret er sendt. Default off: den kræver en Anthropic-nøgle, som er
     * dokumenteret som valgfri ("graceful no-op") og ikke kræves af
     * lib/env-preflight.ts. Uden nøgle springes triagen stille over.
     */
    leadAiTriage: false,
    /** Cookie consent banner (3 kategorier, EU opt-in). Påkrævet for analyticsGa4. */
    consentBanner: false,
    /** GA4 script — loader KUN efter consentBanner=true og bruger har accepteret analytics. */
    analyticsGa4: false,
    /** ProductReview-system: indsendelse, moderation, render, post-purchase email, AggregateRating JSON-LD. */
    reviews: false,
    /** hreflang alternates på PDP + kategori. Auto-off ved single-locale shop. */
    hreflang: false,
    /**
     * Customer-facing currency-switcher i header. Kræver mindst 2 entries i
     * brand.policies.supportedCurrencies. Når true: switcher rendrer i header,
     * formatPrice() konverterer priser fra base-currency (policies.currency)
     * til kunde-valgt currency via static rate-table.
     * Default false så single-currency shops ikke vis en switcher med kun
     * én valuta i.
     */
    currencySwitcher: false,

    /**
     * "True" multi-currency: når true (og currencySwitcher er on med ≥2
     * valutaer), opkræves kunden i den valgte presentment-currency — Stripe
     * PaymentIntent oprettes i den valuta med konverteret beløb, og
     * Order.currency + Order.fxRate snapshottes så kvittering/refund/eksport
     * kan reproducere præcis hvad kunden betalte.
     *
     * Default false: med kun currencySwitcher VISES priser i valgt valuta, men
     * checkout opkræver stadig base-currency (display-only). Flip dette flag
     * for at opgradere til faktisk multi-currency-opkrævning. Adskilt fra
     * currencySwitcher så en shop kan vise priser uden at ændre opkrævning.
     */
    multiCurrency: false,

    /**
     * Google Sheets ↔ catalog sync. Default false; requires the shared Google
     * OAuth connector plus a spreadsheet id configured in /admin/sheets.
     */
    sheetsSync: false,

    /**
     * Auto-refresh FX overrides into IntegrationSettings.fxRatesJson.
     * Default false: checkout/display keep using supportedCurrencies anchors
     * until an operator explicitly enables the runtime cron effect.
     */
    fxAutoUpdate: false,

    /**
     * Customer er på "Cartwright Plus"-tier (honor-system v1 i v0.6.0 —
     * license-validation kommer i en fremtidig PR G når Cartwright Plus
     * pricing landerer på cartwright.app).
     *
     * Påvirker p.t. KUN visuel signalering: SetupWizard viser et "⭐ Pro"
     * badge ved premium-template-options (studio, agent-marketplace) hvis
     * dette flag er false → marketing-signal til kunden om at de er på
     * free-tier mens de bruger premium templates.
     *
     * Når true: badge skjules (kunden har betalt for adgang). Templates er
     * teknisk valgbare uanset flag-state — honor-system.
     */
    cartwrightPlus: false,

    // ─── Phase B baseline (modern web platform) ────────────────────────────
    // Each Phase B feature ships flag-gated. Solbriller legacy defaults to
    // false until each gate is verified on that canary. Runtime feature
    // detection (lib/features.ts) is a second gate — code only uses the
    // modern primitive when both the brand flag AND the browser support it.
    /**
     * Phase B3: ProductCard responds to its own width via @container queries
     * instead of viewport breakpoints. Cards adapt correctly inside sidebar
     * layouts and narrow containers; without this flag the cards fall back
     * to viewport-based responsive (`sm:`/`md:` Tailwind).
     */
    containerQueries: true,
    /**
     * Phase B4: WelcomeGuide (and future modal/drawer surfaces) use native
     * `<dialog>` + Popover API instead of a React-state-controlled `<div>`.
     * Browser handles focus trap, escape-to-close, and backdrop. Falls back
     * to the React-state implementation when the flag is off or the
     * browser lacks support (see lib/features.ts).
     */
    popoverApi: true,
    /**
     * Phase B5: cross-document/SPA View Transitions. ProductCard → PDP and
     * other configured navigations call `document.startViewTransition()`
     * (via app/lib/view-transitions.ts) for smooth morphing transitions.
     * Falls back to instant navigation in browsers that don't support the
     * API (Firefox as of 2026-05) or when the flag is off.
     */
    viewTransitions: true,
    /**
     * Speculation Rules — emit et document-level `<script type="speculationrules">`
     * så Chromium prefetcher sandsynlige næste-navigationer (produkt/kurv/checkout,
     * ekskl. `/admin` + `/api` og `[data-no-prefetch]`) ved `moderate` eagerness
     * (hover/pointerdown) → SPA-hurtig PLP→PDP→checkout uden at forlade server-
     * modellen. Progressive enhancement: browsere uden support (Firefox/Safari)
     * ignorerer scriptet helt, så ingen adfærdsændring dér. Komplementerer Next.js
     * `<Link>`-prefetch med fuld-dokument-prefetch. Default false per "don't ship
     * default-on" ⇒ intet script emitteres ⇒ byte-identisk render (canary-safe).
     * Se components/SpeculationRules.tsx.
     */
    speculationRules: false,
    /**
     * Cartwright Live Canvas — performance-first, AI-konfigurerbar 3D-hero
     * (Three.js, WebGL2). Default false per "don't ship default-on". Når true:
     * design-pakkens hero monterer <ThreeHero> bag indholdet (lazy, ssr:false,
     * CWV-sikker, selv-gating på WebGL2/reduced-motion/saveData → falder tilbage
     * til pakkens gradient). Scene/intensitet styres af `threeD`-blokken nedenfor
     * + DB-override (threeDConfigJson) via /admin/three-d eller AI-tool
     * `three.configure`.
     */
    threeD: false,

    /**
     * Resolvable Genome (kernel). Når true rendres registrerede genome-copy-
     * felter (lib/genome/fields.ts, fx footer.tagline) via readField() som
     * returnerer DB-override ?? resolved-cache ?? brand.config-anker. RENDER
     * KALDER ALDRIG en LLM — resolution trigges kun via /admin/genome eller
     * genome-AI-tool'et. Default false → felter læser deres statiske anker
     * (byte-identisk med før-genome). Se lib/genome/THESIS.md.
     */
    genomeResolve: false,

    /**
     * Per-entity voiced copy: when on, PDP/PLP prefer a genome entityOverride
     * for a product/category description over the entity's own text. Default-off
     * → render is byte-identical. Set overrides via the genome.set_entity_copy
     * tool. See lib/genome/read.ts:readEntityCopy.
     */
    genomeEntityCopy: false,

    /**
     * Vertical / Voice presets (/admin/verticals) — packaged industry voices
     * (kindergarten, carpenter, café, salon) that re-tone the homepage in one
     * click. Default-off: hides the panel. The applied copy shows on the
     * storefront when genomeResolve is also on. See verticals/ + lib/verticals.
     */
    verticalPresets: false,

    /**
     * Mixer preview route (/<locale>/mixer-preview?design=&vertical=) — renders
     * any Skin × Voice combination ephemerally (no DB write, always noindex), so
     * the public mixer on cartwright.app can iframe it. Default-off: 404s in
     * production (canary-safe); always renders in dev. See app/[locale]/mixer-preview.
     */
    mixerPreviewEnabled: false,

    /**
     * In-place AI copy editing ("Annotations"). Når true OG den besøgende er
     * admin, viser storefronten en edit-mode-toggle: klik et copy-element →
     * skriv en note → AI foreslår ny tekst → before/after-diff → bekræft.
     * Skriver via det eksisterende tool-registry (genome.set / settings.update_copy
     * / pages.upsert / products.update / categories.upsert) med plan-først-
     * confirmation + audit. Default false → ingen `data-cw-edit`-attributter og
     * intet overlay rendres (DOM byte-identisk med før for ikke-admins). Se
     * lib/annotate/ + app/api/admin/annotate.
     */
    annotateEdit: false,

    /**
     * Design-adaptive storefront surfaces ("backend follows frontend").
     * When true, the storefront pages that historically had NO design hook —
     * cart, checkout, account (+subpages), blog, services, cases, pricing and
     * order confirmation — adopt the active design's look: palette tokens
     * (sol-*) instead of hardcoded colors, the design's display-font hint on
     * headings, and the DesignPages cart/checkout/account templates when the
     * active pack provides them. Default false renders every page byte-
     * identical to today (canary-critical: Solbrillen/Northbound run
     * cart/checkout live). See components/surfaces/DesignSurface.tsx.
     */
    designSurfaces: false,

    /**
     * Runtime section-layout override for the Studio homepage. When true,
     * design.set_layout can reorder/hide Studio sections via BrandingSettings
     * layoutJson. Default false keeps the hardcoded Studio section order.
     */
    sectionLayout: false,

    /**
     * Visual Builder — admin-only visuelt designerlag (/admin/visual-builder):
     * byg/redigér per-side section-trees (Page.layoutJson) via live-preview +
     * inspector. Compile-time gate (route-mount). Default false så ingen shop
     * eksponerer en ufærdig builder; al mutation går gennem pages.set_layout
     * (tool-registry + audit). Storefront-render påvirkes kun når BÅDE dette
     * flag er on OG en side har et layoutJson sat.
     */
    visualBuilderEnabled: false,

    /**
     * SEO/GEO Autopilot (Pro). Måler søge-performance (GSC) + AI-citation (GEO),
     * foreslår genome-felt-optimeringer, og kører selvforbedrende eksperimenter
     * (apply → mål → behold/revert). Pro-feature (kræver cartwrightPlus). Default
     * false. Cron + dashboard no-op'er når off.
     */
    seoAutopilot: false,

    /**
     * Design-importer. Når true vises /admin/design-import (træk en palette fra
     * en URL ind via Firecrawl + AI → themeJson). Admin-værktøj. Default false.
     */
    designImport: false,

    /**
     * Google Docs content import. Når true vises /admin/docs-import (paste en
     * Google Doc-id/URL → importér som draft blogindlæg eller /info-side) via
     * den eksisterende Google OAuth connector. Admin-værktøj, default false.
     */
    docsImport: false,

    /**
     * Hoptify — parodi-"importér fra Shopify"-onboarding (/admin/hoptify). Hybrid:
     * ægte import (palette via design-import + produkter via Firecrawl-scraper) når
     * FIRECRAWL_API_KEY findes, ellers teater + Hoptify-demo. Admin-værktøj, default false.
     */
    hoptify: false,

    /**
     * Site-import (content.import_site): scrape et eksisterende site (Firecrawl)
     * og genopbyg det som Cartwright-DRAFTS (sider/services/blog + hero-billeder).
     * Intet går live — ejeren gennemgår + omskriver før publish (REBUILD, ikke
     * clone). Default-off indtil review-UI'et (admin) er skibet. Kræver
     * FIRECRAWL_API_KEY.
     */
    siteImport: false,

    /**
     * SitePack (sitepack.export / .import): eksportér hele sitet (design + sider +
     * produkter + content + media + branding) som én portabel `.cartpack` der kan
     * restores på en NYERE Cartwright. Read-only eksport; intet går live ved import
     * (drafts). Default-off indtil admin Snapshot/Restore-wizard'en er skibet.
     */
    sitePack: false,

    /**
     * Gemini logo-generator i /admin/indstillinger (tekst → raster-logo via
     * gemini-2.5-flash-image → Vercel Blob → logoImageUrl). Kræver Gemini-key +
     * BLOB_READ_WRITE_TOKEN. Admin-værktøj, default false.
     */
    logoGenerator: false,

    /**
     * Vercel v0 UI-generering. Når true kan admin vælge "v0" som AI-motor i
     * Vibe Sandbox (ved siden af Anthropic). v0 genererer kode → normaliseres
     * til HTML + saniteres → persisteres som vibeHtml (aldrig TSX-til-disk).
     * Kræver v0-key i /admin/integrations. Admin-værktøj, default false.
     */
    v0Generator: false,

    /**
     * Blog. Når true mountes /[locale]/blog (liste + post), RSS-feed og
     * blog-ruter i sitemap. Default false (mange shops vil ikke have en blog).
     * Koden shipper altid; flaget gater rendering (notFound når off), så
     * runtime-toggleable.
     */
    blog: false,

    /**
     * Stripe Tax — managed multi-country momsberegning (EU OSS, VAT-ID-validering).
     * Default false → lib/tax.ts bruger den indbyggede single-rate (policies
     * .vatRatePct). True → momsen beregnes af Stripe ved checkout (kræver Stripe
     * Tax aktiveret i Stripe-dashboardet). Compile-time-ish; gater integrationen.
     */
    stripeTax: false,

    /**
     * Recurring billing via Stripe Billing subscriptions. Default false so
     * existing one-off checkout remains the only payment workflow unless a
     * webshop fork deliberately opts in and configures Stripe Price IDs.
     */
    subscriptions: false,

    /**
     * Shipping-zoner + rater. Når true beregnes fragt zone/vægt-baseret
     * (lib/shipping/zones.ts) med leveringstid; ellers den flade fragt
     * (policies.shippingDefaultDkk). Default false → uændret flad fragt.
     */
    shippingZones: false,

    /**
     * Ønskeliste (wishlist). Når true vises et hjerte på produktkort + PDP, og
     * /account/wishlist mountes. Logged-in brugere. Default false.
     */
    wishlist: false,

    /**
     * Abandoned-cart email. Når true sender /api/cron/abandoned-cart en cart-
     * recovery-mail til logged-in kunder med en inaktiv kurv. Transactional.
     * Default false → cron'en no-op'er.
     */
    abandonedCart: false,

    /**
     * Marketing-automations via Resend Automations. Når true emitter Cartwright
     * lifecycle-events (welcome / abandoned-cart / post-purchase) til Resend, som
     * kører selve drip-sekvenserne (shop-ejeren wirer dem i Resend-dashboardet på
     * de dokumenterede event-navne). Cartwright sender KUN events — ikke indhold.
     * Consent-gated (kun bekræftede newsletter-subscribers). Runtime-inert uden
     * Resend-key. Default false. Se lib/marketing/automations.ts + docs/.
     */
    marketingAutomations: false,

    /**
     * Kontakt-vedhæftninger. Når true kan besøgende vedhæfte ét billede til
     * kontaktformularen (fx skærmbillede af en fejl) via et OFFENTLIGT, stramt
     * upload-endpoint (kun billeder ≤5MB, magic-bytes, rate-limited). Kræver
     * BLOB_READ_WRITE_TOKEN. Default false — et offentligt upload-endpoint er en
     * abuse/omkostnings-flade. Se app/api/contact/upload + /api/inquiries.
     */
    contactAttachments: false,

    /**
     * "Sign in with GitHub" — viser en Continue-with-GitHub-knap på login ved
     * siden af magic-link. Default false. Aktiveres KUN når både dette flag er
     * true OG GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET er sat (se lib/auth.ts).
     * GitHub-login opretter/linker en KUNDE — admin gives aldrig via OAuth.
     */
    githubAuth: false,

    /**
     * "Continue with Google" — viser en Fortsæt-med-Google-knap på login ved
     * siden af magic-link. Default false. Aktiveres KUN når både dette flag er
     * true OG GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET er sat (se lib/auth.ts).
     * Google-login opretter/linker en KUNDE — admin gives aldrig via OAuth.
     */
    googleAuth: false,

    /**
     * Google Drive media-import + backup destination. Uses the shared Google
     * Workspace OAuth connector (admin/integrations) and stores imported images
     * through the existing Vercel Blob + MediaAsset pipeline. Default false:
     * Drive access is an operational integration and must be enabled per shop.
     */
    googleDrive: false,

    /**
     * AEO-produktindhold (answer-first). Når true vises svar-først-felterne
     * (answerSummary, FAQ, use-cases, sammenligning) i ProductForm OG emitteres
     * FAQPage JSON-LD + svar-først-sektioner på PDP'en når felterne er udfyldt.
     * Felterne er nullable/additive (lossless) — flaget gater KUN UI-synlighed +
     * JSON-LD. Default false per "don't ship default-on". Runtime-toggleable.
     * Canary-paritet: Solbrillen (max-features) sætter true i sit overlay.
     */
    aeoContent: false,

    /**
     * Google Merchant Center-feed på /feed/google.xml (RSS 2.0 + g:-namespace),
     * genbruger lib/feeds/catalog-feed.ts. Off → ruten 404'er. Operatøren
     * registrerer selv feed-URL'en i Merchant Center (account-side, uden for koden).
     * Default false. Runtime-toggleable.
     */
    merchantFeed: false,

    // ─── Ordrestyring (HPOS-grade order management) ────────────────────────
    // Fire additive slices, alle default false, alle ecommerce-precondition.
    // Koden shipper altid; flagene gater render/mount. website-mode (Teloz)
    // ser dem aldrig (precondition ecommerce + /admin/ordrer nav er ecommerce).
    /**
     * Ordre-workspace: HPOS-style ordrestyring. Status-faner, server-side
     * filter/søg/paginering, bulk-handlinger, ordre-noter/timeline, tracking-
     * indtastning, manuel refund og state-machine-styret status-skift i ordre-
     * detaljen. Off → den gamle bare ordre-tabel. Runtime-toggleable.
     */
    orderWorkspace: false,

    /**
     * Pluk-/pakkeseddel (PDF). Printvenlig pluk-liste + pakkeseddel pr.
     * ordre/leverandør (HTML-print → Cmd-P → Gem som PDF). Bygger på
     * fulfillment-routing (lib/fulfillment.ts). Kræver orderWorkspace.
     */
    fulfillmentPdf: false,

    /**
     * Returneringer (RMA). Admin-initieret: registrér retur + årsag, udsted
     * refund og auto-restock fra ordre-workspace. Ingen kunde-portal.
     * Kræver orderWorkspace.
     */
    returns: false,

    /**
     * AI næste-skridt på ordrer. Regelbaserede forslag (afsend, følg op,
     * refundér, undersøg flag) + valgfrit LLM-råd. Kræver orderWorkspace.
     */
    orderAi: false,

    // ─── Magic Builder (prompt-drevet, on-brand sidebygning) ───────────────
    /**
     * Magic Builder — det prompt-drevne "byg en hel side"-lag oven på Visual
     * Builder: beskriv en side → AI lægger en PLAN af whitelisted section-keys
     * → hver sektion udfyldes af generateObject mod sektionens egen Zod-schema
     * (modellen vælger aldrig en tag/farve/font) → sektioner streames live ind
     * i preview (hot reload) → publiceres governeret + revertibelt via
     * pages.set_layout. Compile-time gate (panel-mount i /admin/visual-builder)
     * → kræver redeploy. Kræver også visualBuilderEnabled. Default false.
     * Storefront-render påvirkes ikke (output lever som Page.layoutJson-data,
     * gated af visualBuilderEnabled som i forvejen).
     */
    magicBuilder: false,

    /**
     * Offentlig shadcn-kompatibel komponent-registry på /api/registry. Når true
     * eksponeres section-katalogets prop-JSON-Schema (zodToJsonSchema) så
     * eksterne AI-agenter/IDE'er kan læse hvad hver Cartwright-sektion
     * accepterer. Read-only; 404 når off. Default false.
     */
    componentRegistryPublic: false,

    /**
     * Sub-flag til componentRegistryPublic: server ud over schema også den
     * faktiske MIT-licenserede TSX + token-CSS for et kurateret, fuldt
     * selvstændigt subset af Studio-atomer (så registry'en er en ægte
     * installerbar shadcn-kilde, ikke kun metadata). Aldrig proprietær/
     * server-importerende/tredjeparts-kode. Default false.
     */
    componentRegistryShipsSource: false,

    /**
     * Public look-sharing: GET /api/look serves this shop's look as a
     * cartwright-composition-v1 artifact — COSMETIC fields only (skin,
     * palette, scene, chrome). Copy overrides, voice identity and the
     * homepage layout are never exposed. Powers the "Remix this look" block
     * on /built-with-cartwright. 404 when off. Default false.
     */
    lookSharing: false,

    /**
     * Anonym install-måling på komponent-registry'en: når true tæller hvert
     * servet registry-item (/api/registry/r/<key>.json) op i en per-item-
     * tæller (RegistryHit) — KUN item-slug, aldrig IP/UA/visitor-data — så
     * kuratering af kataloget kan blive data-drevet. Fire-and-forget: tælling
     * blokerer/fejler aldrig selve registry-svaret. Aflæses på
     * /admin/registry-stats. Off ⇒ nul tæller-reads/-writes (byte-identisk
     * adfærd — canary-safe). Kræver `pnpm db:push` (RegistryHit-model) før
     * aktivering. Default false.
     */
    registryStats: false,

    /**
     * Motion & Effects (PART 4) — master-switch for det "levende" lag: scroll-
     * drevne reveal-animationer, animeret aurora-gradient/glassmorphism og
     * per-sektion effect-vokabular (Magic Builder). Off ⇒ data-motion="off" på
     * <html> ⇒ ingen effekt-regler matcher (themes/motion.css er scopet til
     * subtle/bold) ⇒ byte-identisk render. Selve preset'en sættes i
     * `motionPreset` nedenfor. Compile-time (læses i app/layout.tsx). Default false.
     */
    motionEffects: false,
  },

  /**
   * Live Canvas-konfiguration (cosmetic — sikker at override fra DB, modsat
   * identitet). `scene` vælger blandt de indbyggede scener (alle 9 slugs i
   * plugins/three-scenes/scenes/registry.ts — typen SceneId følger registret,
   * så denne union kan ikke drifte igen); `intensity` (0..1) styrer
   * tæthed/hastighed; `paletteSource` "theme" læser brand-farver fra de
   * injicerede --color-sol-* CSS-vars. DB-override merges i lib/three/resolve.ts.
   */
  threeD: {
    scene: "floating-geometry" as SceneId,
    intensity: 0.7,
    paletteSource: "theme" as "theme" | "custom",
  },

  /**
   * Motion-preset (cosmetic — som threeD, sikker at DB-override'e senere).
   * Skalerer den globale "feel" af scroll-drevne effekter via data-motion på
   * <html> (themes/motion.css):
   *   "subtle" = rolige ~12px reveals (Apple/Linear-kalm)
   *   "bold"   = mere udtalte transforms + animeret aurora-baggrund (showcase-wow)
   *   "off"    = ingen effekter
   * Master-gaten er brand.features.motionEffects — er den off, tvinges
   * data-motion="off" uanset denne værdi (se lib/motion.ts → resolveMotionAttr).
   */
  motionPreset: {
    preset: "subtle" as "subtle" | "bold" | "off",
  },

  /**
   * Identity genome-ankre — det høj-niveau "voice" som Resolvable Genome
   * (lib/genome/) harmoniserer resolvable copy-felter imod. Rene config-
   * defaults; DB-overridable via BrandingSettings.genomeJson (sat gennem
   * /admin/genome eller genome-AI-tool'et) UDEN redeploy. Cosmetic — rører
   * aldrig mode/ecommerceEnabled/industryTemplate. At ændre et anker re-
   * resolver hvert felt der dependsOn det (se lib/genome/identity.ts).
   */
  identity: {
    /** Brand-voice resolvable copy skrives i. */
    tone: "professional" as
      | "professional"
      | "playful"
      | "luxurious"
      | "technical"
      | "warm",
    /** Hvem teksten taler til. */
    audience: "general" as "general" | "business" | "consumer" | "enthusiast",
    /** Hvor formelt sproget er. */
    formality: "balanced" as "formal" | "balanced" | "casual",
    /** Overordnet stilistisk vibe-keyword (frit). */
    vibe: "modern" as string,
  },

  // ─── Policies ────────────────────────────────────────────────────────────
  policies: {
    /** Gratis-fragt-threshold i øre (DKK default — opdater ved currency-skift) */
    shippingFreeThresholdDkk: 49900,
    /** Default fragt i øre */
    shippingDefaultDkk: 4900,
    /** Returret-vindue */
    returnDays: 30,
    /**
     * Base currency (ISO-4217). Alle priser i DB er gemt i denne valutas
     * minor-units (øre for DKK, cents for EUR/USD). Multi-currency support
     * via supportedCurrencies nedenfor konverterer ved display-tid.
     */
    currency: "DKK",
    /**
     * Multi-currency rate-table for currencySwitcher feature. Rates er
     * unit-per-1-base-unit (1 DKK = 0.134 EUR ved current rate). Base-currency
     * skal have rate: 1. Opdater manuelt periodisk (fx kvartalsvis) eller
     * tilføj cron-fetch i en senere PR uden breaking change.
     *
     * Skjult for kunden hvis features.currencySwitcher: false OR kun
     * 1 entry her (giver ingen mening at "switche" til samme valuta).
     */
    supportedCurrencies: {
      DKK: { rate: 1, label: "Danske kroner" },
      EUR: { rate: 0.134, label: "Euro" },
      USD: { rate: 0.145, label: "US Dollar" },
    } as Record<string, { rate: number; label: string }>,
    /** ISO-3166-1 alpha-2 land — bruges i shipping/return JSON-LD (Merchant Listing) */
    country: "DK",

    // ─── GDPR / data-governance ────────────────────────────────────────────
    /**
     * Retention af kundedata (ordrer + PII) i måneder før anonymisering.
     * null = ingen automatisk retention (manuel sletteret via /admin/kunder
     * gælder altid). Bruges af docs/gdpr/pii-inventory.md + en fremtidig
     * retention-cron.
     */
    retentionMonths: null as number | null,
    /**
     * AuditLog-retention i dage. null = behold for evigt (DEFAULT — audit-log
     * er dokumentation/lovligt grundlag). Sæt fx 365 for at lade
     * /api/cron/audit-retention slette ældre rows. Cron'en er default-OFF
     * (kører kun når dette er sat) + understøtter dry-run.
     */
    auditRetentionDays: null as number | null,
    /**
     * Processor-register (GDPR art. 28) — tredjeparter der modtager kundedata.
     * Vises read-only på /admin/processors. `dpa` = databehandleraftale
     * registreret. Fork-shops tilpasser listen til deres reelle processors.
     */
    processors: [
      { name: "Turso (libSQL)", purpose: "Database / hosting af al shop-data", data: "Alle kunde- og ordredata", dpa: true },
      { name: "Stripe", purpose: "Betalinger", data: "Navn, email, adresse, beløb", dpa: true },
      { name: "Resend", purpose: "Transaktionelle emails", data: "Email + ordredetaljer", dpa: true },
      { name: "Anthropic", purpose: "AI-assistent (chat + generation)", data: "Chat-beskeder (anonymiseret session-id)", dpa: false },
      { name: "Google (Gemini)", purpose: "Voice/vision-AI (valgfri)", data: "Voice-audio, produktbilleder", dpa: false },
      { name: "Vercel (v0 Platform API)", purpose: "AI kode/design-generering (admin-only, valgfri)", data: "Admin-prompts + brand-tokens (ingen kunde-PII)", dpa: false },
      { name: "Vercel Blob", purpose: "Medie/fil-lagring", data: "Uploadede billeder/video", dpa: true },
      { name: "Sentry", purpose: "Fejlovervågning", data: "PII-scrubbed fejl-events", dpa: true },
      { name: "Google Analytics 4", purpose: "Analytics (consent-gated)", data: "Anonymiserede pageviews", dpa: false },
    ] as ReadonlyArray<{ name: string; purpose: string; data: string; dpa: boolean }>,

    // ─── Moms / VAT ────────────────────────────────────────────────────────
    /**
     * Moms-sats i procent (single-rate baseline). DK = 25. Bruges af lib/tax.ts
     * til at udregne moms-andelen af en pris. For multi-country/EU-OSS bruges
     * Stripe Tax i stedet (features.stripeTax + lib/tax/stripe-provider) — den
     * managed vej; denne sats er baseline for single-country shops.
     */
    vatRatePct: 25,
    /**
     * Er priser i DB INKL. moms (dansk B2C-konvention, true) eller EKSKL. (B2B,
     * false)? Styrer om lib/tax.ts trækker momsen UD af prisen eller lægger den
     * OVENPÅ ved breakdown/faktura.
     */
    pricesIncludeVat: true,
  },

  // ─── Company info (legal entity bag shoppen) ─────────────────────────────
  // Bruges af /contact-siden + footer-disclaimer. Fork-shops overrider hele
  // company-objektet med deres egne data. Tomme strings = vis ikke linjen.
  // Eksplicit `as string` på tomme felter så `as const` på brand-objektet
  // ikke narrow'er dem til literal "" (= TS-narrowing bryder usage-site).
  company: {
    /** Officiel legal-name (ApS/A/S/Ltd osv) — vises på kontakt + footer */
    legalName: "Cartwright" as string,
    /** Dansk CVR / international tax-id (vises kun hvis sat) */
    cvr: "" as string,
    /** Adresselinje (street + house no.) */
    address: "" as string,
    /** Postnummer */
    postalCode: "" as string,
    /** By */
    city: "" as string,
    /** Region/stat (valgfri) */
    region: "" as string,
    /** Land — ISO-3166-1 alpha-2 eller fuldt navn */
    country: "Danmark" as string,
  },

  // ─── Contact (customer-support + sales kontakt-info) ─────────────────────
  // Bruges af /contact-siden + AI-assistant-eskalations-prompts.
  contact: {
    /** Primær support/sales email */
    email: "kontakt@cartwright.app" as string,
    /** Telefon (sæt tomt hvis ingen) */
    phone: "" as string,
    /** Åbningstider tekst — fri-form */
    hours: "Hverdage 9-17" as string,
  },

  // ─── Website mode defaults (Studio + Website-Corporate templates) ────────
  // Læses af StudioHomeClient når brand.industryTemplate === "studio" og
  // ecommerceEnabled === false. DB BrandingSettings.{websiteHeadline,tagline,
  // heroCta} overrider headline/tagline/cta hvis sat. Alle øvrige tekster
  // (valueProps, features, steps, stack) lever kun her — fork-shops redigerer
  // dette objekt før første deploy.
  //
  // Strings/arrays er typed som ()-cast så `as const` på brand-objektet ikke
  // narrow'er dem til literal types (bryder StudioHomeClient.tsx prop-shapes).
  website: {
    /** Hero eyebrow-badge — fjern (sæt "") for cleaner look. */
    eyebrow: "v0.6 launch" as string,
    /** Hero H1. Splittes ikke; render som-is. */
    headline: "Ship software that ships itself" as string,
    /** Inline-accent efter headline (terracotta underline). "" = skjul. */
    headlineAccent: "" as string,
    /** Hero lead-paragraf (1-2 sætninger). */
    tagline:
      "A studio template built on Cartwright — the AI-first commerce + site engine." as string,
    /** Primary CTA-tekst + destination. */
    cta: "Get started" as string,
    ctaHref: "/contact" as string,
    /** Sekundær CTA. Sæt label="" for at skjule. */
    secondaryCtaLabel: "See services" as string,
    secondaryCtaHref: "/services" as string,
    /** Microcopy under CTA-row (tech-stack, license, mm). "" = skjul. */
    microcopy: "Next.js 16 · Tailwind v4 · MIT" as string,

    // ─── Value-props section ───────────────────────────────────────────────
    valuePropsEyebrow: "Why us" as string,
    valuePropsTitle: "Three promises. No asterisks." as string,
    valuePropsDescription:
      "A studio that takes shipping seriously — and respects that you’re the one running the product after." as string,
    valueProps: [
      {
        title: "Yours, forever",
        body:
          "Not a SaaS. Not a fork. You scaffold your own repo, you ship it, you own the code. No platform lock-in, no monthly tax per order.",
      },
      {
        title: "AI-native",
        body:
          "MCP server, Anthropic + Gemini integrations, and an agent-driven admin shipped on day one. AI is in the spine, not bolted on as a feature.",
      },
      {
        title: "Production-shaped",
        body:
          "Stripe, NextAuth magic-link, Vercel Blob, Resend, Sentry — wired and verified. Not a tutorial. A real product you can ship to customers.",
      },
    ] as Array<{ title: string; body: string }>,

    // ─── Feature grid section ──────────────────────────────────────────────
    featuresEyebrow: "What’s in the box" as string,
    featuresTitle: "A real product, not a starter kit." as string,
    featuresDescription:
      "Every cell below is shipping code — wired, typed, and verified." as string,
    features: [
      {
        title: "Admin panel",
        body:
          "12 admin routes — products, orders, content, integrations, AI prompts, analytics.",
      },
      {
        title: "Storefront",
        body:
          "Landing, PDP, cart, checkout, account, magic-link auth — all in the box.",
      },
      {
        title: "MCP server",
        body:
          "Built-in /api/mcp with a tool registry — agents talk to your site natively.",
      },
      {
        title: "AI assistant",
        body:
          "Anthropic and Gemini wired in. Bring your keys, swap providers in one file.",
      },
      {
        title: "Stripe checkout",
        body:
          "DB-first secret keys. Test mode and live mode toggled from the admin.",
      },
      {
        title: "Magic-link auth",
        body: "NextAuth with Resend. No third-party identity vendor lock-in.",
      },
    ] as Array<{ title: string; body: string }>,

    // ─── How-it-works section ──────────────────────────────────────────────
    stepsEyebrow: "From zero to selling" as string,
    stepsTitle: "Three steps. Five minutes." as string,
    stepsDescription: "The longest part is choosing a project name." as string,
    steps: [
      {
        n: "01",
        title: "Scaffold",
        body:
          "Run npx create-cartwright. Pick database, AI features, and a name. The CLI clones a sanitised template, fills env, and installs.",
        code: "npx create-cartwright@latest my-shop",
      },
      {
        n: "02",
        title: "Setup wizard",
        body:
          "Visit /admin/setup. Add Stripe, Resend, Anthropic keys through a UI. Keys persist DB-first.",
        code: "pnpm dev → /admin/setup",
      },
      {
        n: "03",
        title: "Deploy",
        body:
          "Push to Vercel. Cron jobs, AI gateway, and migrations are all wired into the deploy.",
        code: "vercel --prod",
      },
    ] as Array<{ n: string; title: string; body: string; code?: string }>,

    // ─── Stack grid section ────────────────────────────────────────────────
    stackEyebrow: "The stack" as string,
    stackTitle: "All current versions. No legacy." as string,
    stackDescription:
      "Modern dependencies on day one — from Next 16 and React 19 to Tailwind v4 and the latest AI SDKs." as string,
    stack: [
      "Next.js 16",
      "React 19",
      "TypeScript 6",
      "Tailwind v4",
      "Prisma",
      "Turso",
      "NextAuth",
      "Stripe",
      "Anthropic SDK",
      "Gemini SDK",
      "Vercel AI SDK",
      "Resend",
      "Sentry",
      "Zod",
      "MCP",
    ] as string[],

    // ─── Final CTA-footer ──────────────────────────────────────────────────
    ctaFooterTitle: "Ship something real this week." as string,
    ctaFooterDescription:
      "Scaffold, configure, deploy. No platform contract, no per-order fee." as string,
    ctaFooterCtaLabel: "Get started" as string,
    ctaFooterCtaHref: "/contact" as string,
    ctaFooterSecondaryLabel: "Read the docs" as string,
    ctaFooterSecondaryHref: "/info" as string,
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
    disclaimer: "Cartwright · Alle rettigheder forbeholdes.",
    copyrightYear: 2026,
    /**
     * "Owned and operated by"-link i footerens bottom-row. Linkteksten er
     * `company.legalName`; denne URL er destinationen. Engine-default = Teloz
     * (reproducerer det hidtidige hardcodede render tegn-for-tegn);
     * fork-shops sætter deres egen ejer-URL her.
     */
    ownerUrl: "https://cartwright.app" as string,
    /** GitHub-profil-link i footerens bottom-row. "" = brug engine-default. */
    githubUrl: "https://github.com/Teloz1870/cartwright-template" as string,
  },

  // ─── Image-defaults ──────────────────────────────────────────────────────
  // Bruges når DB-felt (fx Category.heroImage) er null
  images: {
    // Industri-neutral default. Fork-shops overrider via BrandingSettings.heroImage
    // i /admin/Settings, eller redigerer her direkte i deres fork.
    hero: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600",
    lifestyle:
      "https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=1200",
    scenic:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600",
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
    colorPrimary: "#c33f16",
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
    heroTitle: "Your shop starts here",
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
    accent: "#c33f16",
    cream: "#f4efe6",
    sand: "#e8e1d3",
    ink: "#1a1a1a",
    muted: "#726d62",
    success: "#c33f16",
  },
} as const;

export type Brand = typeof brand;
