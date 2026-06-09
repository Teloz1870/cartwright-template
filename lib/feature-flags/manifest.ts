import { brand } from "@/brand.config";

/**
 * Feature-management manifest — single source of truth for hver features
 * metadata. Driver admin-UI'et (/admin/features), AI-tools (lib/tools/features.ts),
 * discovery-surfaces (llms.txt, .well-known/ucp) OG runtime-override-sikkerheden.
 *
 * NB: `lib/features.ts` er en SEPARAT ting (browser-capability-detektion:
 * supportsDialog/supportsViewTransitions). Dette modul handler om hvilke
 * brand.features.* der er på/af og om de kan toggles live.
 *
 * Tilføj en fremtidig feature = tilføj én entry i DESCRIPTORS nedenfor.
 * `DESCRIPTORS` er typet `Record<FeatureKey, …>`, så et nyt flag i
 * brand.config.ts UDEN manifest-entry (eller en stavefejl/ekstra key) giver
 * en compile-fejl her. Det er den håndhævede sync-garanti.
 */

/** Hvordan en feature er gated — afgør om den kan toggles live fra DB. */
export type FeatureTier =
  /** Koden shipper altid; flag gater kun conditional render → live-toggleable. */
  | "runtime"
  /** Flag gater route-mount/build-wiring → kræver redeploy, vises read-only. */
  | "compile-time"
  /** Definerer hvad sitet ER (mode/ecommerceEnabled/industryTemplate) → låst. */
  | "identity";

/** Type-safety-anker: alle manifest-keys SKAL være rigtige brand.features-flags. */
export type FeatureKey = keyof typeof brand.features;

export type FeaturePrecondition =
  | { kind: "minCurrencies"; value: number }
  | { kind: "ecommerce" };

export type FeatureDescriptor = {
  key: FeatureKey;
  /** Menneske-label til admin-UI + AI-output. */
  label: string;
  description: string;
  /** UI-gruppering i dashboardet. */
  group: string;
  tier: FeatureTier;
  /** Afledt: true ⟺ tier === "runtime". Sikkerheds-allowlistens kilde. */
  runtimeToggleable: boolean;
  /** Andre flags der skal være ON før denne giver mening (vises + valideres). */
  dependsOn?: FeatureKey[];
  /** Ikke-flag-betingelse (fx ≥2 valutaer, eller ecommerce-mode). */
  precondition?: FeaturePrecondition;
  /** Vises ved compile-time-features: hvordan operatøren ændrer dem. */
  requiresRedeployNote?: string;
  /** false = flag defineret men ikke wired endnu → greyed + AI hævder den ikke. */
  implemented: boolean;
};

const REDEPLOY_NOTE =
  "Sættes ved build-tid i brand.config.ts. Ret værdien dér og redeploy for at ændre den.";

/**
 * Fuld descriptor-map. `Record<FeatureKey, …>` ⇒ TypeScript kræver præcis ÉN
 * entry pr. flag i brand.config.ts (ingen manglende, ingen ekstra, ingen typo).
 * `runtimeToggleable` udledes af `tier` nedenfor — så de aldrig kan divergere.
 */
const DESCRIPTORS: Record<FeatureKey, Omit<FeatureDescriptor, "key" | "runtimeToggleable">> = {
  // ─── Storefront UX (runtime) ──────────────────────────────────────────────
  aiStylist: {
    label: "AI-assistent (FAB)",
    description: "Storefront AI-assistant-knap + panel.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  newsletter: {
    label: "Nyhedsbrev",
    description: "Newsletter-sektion i footeren.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  cartwrightBadge: {
    label: "Cartwright-mærke",
    description: "“Built with Cartwright”-referral-mærke i footeren.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  welcomeGuide: {
    label: "Velkomst-guide",
    description: "First-visit velkomst-modal der peger nye ejere mod /admin.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  reviews: {
    label: "Anmeldelser",
    description: "ProductReview-system: indsendelse, moderation, render, AggregateRating JSON-LD.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  currencySwitcher: {
    label: "Valuta-vælger",
    description: "Customer-facing currency-switcher i headeren.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "minCurrencies", value: 2 },
    implemented: true,
  },
  multiCurrency: {
    label: "Multi-currency-opkrævning",
    description:
      "Opkræv kunden i den valgte valuta (Stripe + ordre-snapshot), ikke kun vis prisen.",
    group: "Commerce & protocols",
    tier: "runtime",
    dependsOn: ["currencySwitcher"],
    precondition: { kind: "minCurrencies", value: 2 },
    implemented: true,
  },
  fxAutoUpdate: {
    label: "FX auto-refresh",
    description:
      "Daglig cron henter ECB-referencekurser og skriver DB-overrides, mens supportedCurrencies forbliver fallback-anker.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "minCurrencies", value: 2 },
    implemented: true,
  },
  sheetsSync: {
    label: "Google Sheets catalog sync",
    description:
      "Tovejs synkronisering mellem Google Sheets og produktkataloget via den delte Google OAuth-connector.",
    group: "Commerce & protocols",
    tier: "runtime",
    implemented: true,
  },
  phoneWidget: {
    label: "Telefon-widget",
    description: "Phone.inc click-to-call/chat-widget i hjørnet af storefront.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  announcementBar: {
    label: "Announcement-bar",
    description: "Promo-stribe i toppen af storefront.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },

  // ─── Modern web platform (runtime) ────────────────────────────────────────
  containerQueries: {
    label: "Container queries",
    description: "ProductCard tilpasser sig egen bredde via @container i stedet for viewport-breakpoints.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  popoverApi: {
    label: "Popover/dialog API",
    description: "Modal/drawer-surfaces bruger native <dialog> + Popover API med React-fallback.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  viewTransitions: {
    label: "View Transitions",
    description: "Bløde morphing-overgange (ProductCard → PDP) via document.startViewTransition().",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  threeD: {
    label: "Live Canvas (3D)",
    description:
      "AI-konfigurerbar Three.js 3D-hero (WebGL2). CWV-sikker, tema-farvet, lazy. Scene/intensitet sættes i /admin/three-d.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  genomeResolve: {
    label: "Resolvable Genome",
    description:
      "Registrerede genome-copy-felter (fx footer.tagline) rendres via readField() = override ?? resolved-cache ?? anker, harmoniseret mod identity-ankrene. Render kalder aldrig en LLM; resolution trigges i /admin/genome.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  verticalPresets: {
    label: "Vertical / Voice presets",
    description:
      "Pakkede branche-stemmer (børnehave, tømrer, café, salon) på /admin/verticals — anvend identitets-ankre + forhåndsskrevet genome-copy for at gen-tone forsiden på ét klik, evt. med et foreslået design. Ortogonal til skinnet (bland enhver Voice med ethvert design). Den anvendte copy vises på storefront når genomeResolve er tændt. Default-off: skjuler admin-panelet; intet anvendes før den tændes.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  mixerPreviewEnabled: {
    label: "Mixer preview-rute",
    description:
      "Aktiverer /<locale>/mixer-preview?design=&vertical= — renderer enhver Skin × Voice-kombination ephemeralt (ingen DB-write, altid noindex), så den offentlige mixer på cartwright.app kan iframe den. Default-off: i produktion 404'er ruten (canary-sikkert); i dev rendrer den altid.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  annotateEdit: {
    label: "In-place copy-redigering",
    description:
      "Admin klikker et copy-element på den live storefront → skriver en note → AI foreslår ny tekst → before/after-diff → bekræft. Skriver via tool-registry (genome.set / settings.update_copy / pages.upsert / products.update / categories.upsert) med plan-først-confirmation + audit. Kun synlig for admin; default off = ingen overlay/attributter.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  sectionLayout: {
    label: "Section layout-override (studio)",
    description:
      "AI-agent kan reordere/skjule sektioner af studio-homepage via layoutJson. Andre design-packs ignorerer feltet.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  visualBuilderEnabled: {
    label: "Visual Builder",
    description:
      "Admin-only visuelt designerlag (/admin/visual-builder): byg/redigér per-side section-trees via live-preview + inspector. Al mutation går gennem pages.set_layout (tool-registry + audit). Route-mount gated → kræver redeploy.",
    group: "Modern web platform",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  designImport: {
    label: "Design-import",
    description:
      "Træk en farvepalette fra en URL ind via Firecrawl + AI → themeJson (/admin/design-import).",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  docsImport: {
    label: "Google Docs-import",
    description:
      "Importer et Google Doc som draft blogindlæg eller /info-side via den eksisterende Google OAuth connector (/admin/docs-import).",
    group: "AI/Discovery",
    tier: "runtime",
    implemented: true,
  },
  seoAutopilot: {
    label: "SEO/GEO Autopilot (Pro)",
    description:
      "Måler søge-perf (GSC) + AI-citation, og kører selvforbedrende genome-eksperimenter (apply→mål→behold/revert). Pro (cartwrightPlus). /admin/seo-performance.",
    group: "Discovery & AI",
    tier: "runtime",
    dependsOn: ["cartwrightPlus"],
    implemented: true,
  },
  hoptify: {
    label: "Hoptify-onboarding",
    description:
      "Parodi-“importér fra Shopify” (/admin/hoptify): hybrid teater + ægte import (palette + produkter) når FIRECRAWL_API_KEY findes.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  logoGenerator: {
    label: "Logo-generator (Gemini)",
    description:
      "Generér et raster-logo fra en prompt via gemini-2.5-flash-image → Vercel Blob → logoImageUrl (/admin/indstillinger). Kræver Gemini-key + BLOB_READ_WRITE_TOKEN.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  v0Generator: {
    label: "v0 UI-generering",
    description:
      "Generér storefront-sektioner via Vercel v0 Platform API (text→UI) som alternativ AI-motor i Vibe Sandbox. v0's kode normaliseres til HTML + saniteres og persisteres som vibeHtml (aldrig TSX-til-disk). Kræver v0-key i /admin/integrations.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  githubAuth: {
    label: "Sign in with GitHub",
    description:
      "Continue-with-GitHub-knap på login ved siden af magic-link. Kræver GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET i env. GitHub-login opretter/linker en kunde — aldrig admin.",
    group: "Storefront UX",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  googleAuth: {
    label: "Google-login",
    description:
      "Fortsæt-med-Google-knap på login ved siden af magic-link. Kræver GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET i env. Google-login opretter/linker en kunde — aldrig admin.",
    group: "Storefront UX",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  googleDrive: {
    label: "Google Drive import + backup",
    description:
      "Importer billeder fra en konfigureret Drive-mappe til MediaAsset/Vercel Blob, og send logiske DB-backups til Drive. Bruger den delte Google Workspace OAuth2-connector.",
    group: "Discovery & AI",
    tier: "runtime",
    dependsOn: ["mediaLibrary"],
    implemented: true,
  },
  blog: {
    label: "Blog",
    description:
      "Blog på /blog (liste + post), RSS-feed, BlogPosting JSON-LD + sitemap. Posts redigeres i /admin/blog.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  stripeTax: {
    label: "Stripe Tax (moms)",
    description:
      "Managed multi-country momsberegning via Stripe Tax (EU OSS, VAT-ID-validering). Off → indbygget single-rate (policies.vatRatePct).",
    group: "Compliance & privacy",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  subscriptions: {
    label: "Abonnementer",
    description:
      "Recurring billing via Stripe Billing subscriptions: Checkout Session, kundeportal i /account/subscriptions og admin-overblik.",
    group: "Commerce & Protocols",
    tier: "compile-time",
    precondition: { kind: "ecommerce" },
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  shippingZones: {
    label: "Shipping-zoner",
    description:
      "Zone/vægt-baseret fragt + leveringstid (/admin/shipping). Off = flad fragt.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  wishlist: {
    label: "Ønskeliste",
    description:
      "Hjerte-knap på produktkort + PDP, og /account/wishlist. Logged-in brugere.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  abandonedCart: {
    label: "Abandoned cart email",
    description:
      "Cart-recovery-mail til logged-in kunder med inaktiv kurv (cron). Transactional.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  marketingAutomations: {
    label: "Marketing automations (Resend)",
    description:
      "Emitter lifecycle-events (welcome / abandoned-cart / post-purchase) til Resend Automations, som kører drip-sekvenserne. Cartwright sender kun events; ejeren wirer sekvenserne i Resend. Consent-gated; kræver Resend-key.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  contactAttachments: {
    label: "Kontakt-vedhæftninger",
    description:
      "Lader besøgende vedhæfte et billede til kontaktformularen via et offentligt, stramt upload-endpoint (kun billeder ≤5MB, magic-bytes, rate-limited). Kræver BLOB_READ_WRITE_TOKEN. Default-off.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },

  // ─── Ordrestyring (HPOS-grade order management, runtime) ──────────────────
  orderWorkspace: {
    label: "Ordre-workspace",
    description:
      "HPOS-style ordrestyring: status-faner, filter/søg/paginering, bulk-handlinger, ordre-noter/timeline, tracking-indtastning og manuel refund i ordre-detaljen. Off = den gamle bare ordre-tabel.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  fulfillmentPdf: {
    label: "Pluk-/pakkeseddel (PDF)",
    description:
      "Printvenlig pluk-liste + pakkeseddel pr. ordre/leverandør (HTML-print → Gem som PDF). Bygger på fulfillment-routing.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    dependsOn: ["orderWorkspace"],
    implemented: true,
  },
  returns: {
    label: "Returneringer (RMA)",
    description:
      "Admin-initieret retur: registrér retur + årsag, udsted refund og auto-restock fra ordre-workspace. Ingen kunde-portal.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    dependsOn: ["orderWorkspace"],
    implemented: true,
  },
  orderAi: {
    label: "AI næste-skridt (ordrer)",
    description:
      "Regelbaserede + valgfrit LLM-forslag til næste handling på en ordre (afsend, følg op, refundér, undersøg flag).",
    group: "Discovery & AI",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    dependsOn: ["orderWorkspace"],
    implemented: true,
  },

  // ─── Platform (runtime) ───────────────────────────────────────────────────
  cartwrightPlus: {
    label: "Cartwright Plus",
    description: "Honor-system Pro-tier-signal. Påvirker kun visning af “⭐ Pro”-badges i admin.",
    group: "Platform",
    tier: "runtime",
    implemented: true,
  },
  mcpPublic: {
    label: "Offentlig MCP",
    description: "Eksponér /api/mcp + /api/v1/tools offentligt (discovery-signal for AI-first shops).",
    group: "Discovery & AI",
    tier: "runtime",
    implemented: true,
  },
  webMcp: {
    label: "WebMCP (in-browser tools)",
    description:
      "Eksponér storefront-handlinger (search_products, add_to_cart) som browser-native WebMCP-tools til in-browser AI-agenter (document.modelContext). EKSPERIMENTELT: Chrome-only origin-trial, W3C-draft — default-off, hold af canary-mosaikken indtil spec'en stabiliserer.",
    group: "Discovery & AI",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },

  // ─── Commerce & protocols (compile-time) ──────────────────────────────────
  webshop: {
    label: "Webshop",
    description: "Cart/checkout-routes + add-to-cart UI. Spejler brand.mode === \"webshop\".",
    group: "Commerce & protocols",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  acp: {
    label: "Agentic Commerce Protocol",
    description: "ACP checkout-endpoints (/api/acp/*). Spejler acp.enabled.",
    group: "Commerce & protocols",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  a2a: {
    label: "Agent-to-Agent",
    description: "A2A-endpoints (agent-card, negotiate, escrow/verify). 404 når off.",
    group: "Commerce & protocols",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  adminAgenticDashboard: {
    label: "Agentic admin-dashboard",
    description: "/admin/agentic (live A2A-transaktioner, escrow-kø, policy-editor).",
    group: "Commerce & protocols",
    tier: "compile-time",
    dependsOn: ["a2a"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  voiceShop: {
    label: "Voice shopping",
    description: "Voice-shopping via Gemini Live (mic-FAB). Kræver også admin-toggle + Gemini-key.",
    group: "Commerce & protocols",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },

  // ─── Compliance & privacy (compile-time) ──────────────────────────────────
  consentBanner: {
    label: "Cookie-samtykke",
    description: "EU 3-kategori cookie-consent-banner. Forudsætning for GA4.",
    group: "Compliance & privacy",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  analyticsGa4: {
    label: "Google Analytics 4",
    description: "GA4-script — loader kun efter consent. Privatlivs-følsom, derfor build-tid-gated.",
    group: "Compliance & privacy",
    tier: "compile-time",
    dependsOn: ["consentBanner"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },

  // ─── Discovery & AI ───────────────────────────────────────────────────────
  mediaLibrary: {
    label: "Mediebibliotek",
    description: "Centralt MediaAsset-bibliotek + ProductMedia-join.",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  aeoContent: {
    label: "AEO-produktindhold",
    description:
      "Svar-først produktindhold: summary, FAQ, use-cases, sammenligning + FAQPage JSON-LD + svar-først-sektioner på PDP'en. Felterne er nullable/lossless; flaget gater UI-synlighed + JSON-LD.",
    group: "Discovery & AI",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  merchantFeed: {
    label: "Google Merchant-feed",
    description:
      "Google Shopping XML-produktfeed på /feed/google.xml (genbruger catalog-feed). Off → 404. Operatøren registrerer selv URL'en i Merchant Center.",
    group: "Discovery & AI",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  hreflang: {
    label: "hreflang-alternates",
    description:
      "hreflang-alternates (per-locale + x-default) på PDP + kategori-metadata via i18n/routing. Auto-tom på single-locale shops.",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  altTextAi: {
    label: "AI alt-tekst",
    description:
      "Gemini vision-genereret alt-tekst/caption/geoSnippet/farver på upload, async via cron /api/cron/media-ai (gated på dette flag). Redigeres i /admin/media.",
    group: "Discovery & AI",
    tier: "compile-time",
    dependsOn: ["mediaLibrary"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  tryOn: {
    label: "Virtual try-on",
    description: "AR virtual try-on (eyewear-specifikt). (Defineret, endnu ikke wired.)",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: false,
  },
  ucpIdentityLinking: {
    label: "UCP identity-linking (OAuth)",
    description:
      "UCP dev.ucp.common.identity_linking: OAuth 2.0 Authorization-Code + PKCE så agenter kan handle på en brugers vegne på tværs af merchants. Eksponerer /.well-known/oauth-authorization-server + /oauth/{authorize,token,revoke,register} og en spec-formet capability i /.well-known/ucp. Default-off; kør db:push (OAuthClient/OAuthAuthCode/OAuthToken) før aktivering. Se docs/HUL-D-UCP-IDENTITY-LINKING.md.",
    group: "Commerce & protocols",
    tier: "runtime",
    implemented: true,
  },

  // ─── Magic Builder (prompt-drevet sidebygning) ────────────────────────────
  magicBuilder: {
    label: "Magic Builder",
    description:
      "Prompt-drevet 'byg en hel side'-lag i /admin/visual-builder: beskriv en side → AI lægger en plan af whitelisted section-keys → hver sektion udfyldes af generateObject mod sektionens egen Zod-schema (modellen vælger aldrig tag/farve/font) → sektioner streames live ind i preview (hot reload) → publiceres governeret + revertibelt via pages.set_layout. Compile-time (panel-mount). Kræver redeploy.",
    group: "Modern web platform",
    tier: "compile-time",
    dependsOn: ["visualBuilderEnabled"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  componentRegistryPublic: {
    label: "Komponent-registry (offentlig)",
    description:
      "Offentlig shadcn-kompatibel registry på /api/registry: eksponerer section-katalogets prop-JSON-Schema (zodToJsonSchema) så eksterne AI-agenter/IDE'er kan læse hvad hver Cartwright-sektion accepterer. Read-only; 404 når off.",
    group: "Discovery & AI",
    tier: "runtime",
    implemented: true,
  },
  componentRegistryShipsSource: {
    label: "Registry: ship komponent-kildekode",
    description:
      "Sub-flag til komponent-registry'en: server ud over schema også faktisk MIT-licenseret TSX (+ lokale sibling-deps) for et kurateret, selvstændigt subset af Studio-atomer (installerbar shadcn-kilde via `npx shadcn add`). Kilden embeddes ved build-tid (scripts/build-registry-source.ts → lib/magic/registry-source.ts). Aldrig proprietær/server-importerende/tredjeparts-kode.",
    group: "Discovery & AI",
    tier: "runtime",
    dependsOn: ["componentRegistryPublic"],
    implemented: true,
  },

  // ─── Motion & Effects (scroll-driven animations + presets) ────────────────
  motionEffects: {
    label: "Motion & effekter",
    description:
      "Gør siderne 'levende': scroll-drevne reveal-animationer (CSS animation-timeline: view() — kører på compositor-tråden, ingen JS-jank), animeret aurora-gradient + glassmorphism, og et per-sektion effect-vokabular som Magic Builder kan tildele. En shop-preset (subtle/bold/off) skalerer hele feel'en via data-motion på <html>. Alt feature-detected (@supports) + prefers-reduced-motion-safe + falder tilbage til statisk render (RevealOnScroll). Off ⇒ data-motion=\"off\" ⇒ byte-identisk render (canary-safe).",
    group: "Modern web platform",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
};

/** Den fulde feature-liste, afledt af DESCRIPTORS. `runtimeToggleable` udledt af tier. */
export const FEATURE_MANIFEST: readonly FeatureDescriptor[] = (
  Object.keys(DESCRIPTORS) as FeatureKey[]
).map((key) => ({
  key,
  ...DESCRIPTORS[key],
  runtimeToggleable: DESCRIPTORS[key].tier === "runtime",
}));

/**
 * Sikkerheds-allowlisten. KUN keys i dette sæt må overrides via DB
 * (se lib/feature-flags/resolve.ts). Afledt — aldrig håndvedligeholdt.
 */
export const RUNTIME_TOGGLEABLE_KEYS: ReadonlySet<FeatureKey> = new Set(
  FEATURE_MANIFEST.filter((f) => f.runtimeToggleable).map((f) => f.key),
);

export function getDescriptor(key: FeatureKey): FeatureDescriptor | undefined {
  return FEATURE_MANIFEST.find((f) => f.key === key);
}

/** Identitets-felter — IKKE i brand.features. Vises read-only/“låst” i admin. */
export type IdentityDescriptor = {
  key: "mode" | "ecommerceEnabled" | "industryTemplate";
  label: string;
  description: string;
};

export const IDENTITY_DESCRIPTORS: readonly IdentityDescriptor[] = [
  {
    key: "mode",
    label: "Mode",
    description: "website / webshop / agent-marketplace — top-level identitet.",
  },
  {
    key: "ecommerceEnabled",
    label: "E-commerce aktiveret",
    description: "Gater kerne-shop-routes. Sovereign fra brand.config (Phase G/H-guard).",
  },
  {
    key: "industryTemplate",
    label: "Industry-template",
    description: "Vælger seed-data (coffee/sunglasses/saas/…).",
  },
] as const;
