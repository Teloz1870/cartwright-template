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
  "Set at build time in brand.config.ts. Change the value there and redeploy to update it.";

/**
 * Fuld descriptor-map. `Record<FeatureKey, …>` ⇒ TypeScript kræver præcis ÉN
 * entry pr. flag i brand.config.ts (ingen manglende, ingen ekstra, ingen typo).
 * `runtimeToggleable` udledes af `tier` nedenfor — så de aldrig kan divergere.
 */
const DESCRIPTORS: Record<FeatureKey, Omit<FeatureDescriptor, "key" | "runtimeToggleable">> = {
  // ─── Storefront UX (runtime) ──────────────────────────────────────────────
  aiStylist: {
    label: "AI assistant (FAB)",
    description: "Storefront AI assistant button + panel.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  newsletter: {
    label: "Newsletter",
    description: "Newsletter section in the footer.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  cartwrightBadge: {
    label: "Cartwright badge",
    description: "“Built with Cartwright” referral badge in the footer.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  welcomeGuide: {
    label: "Welcome guide",
    description: "First-visit welcome modal that points new owners to /admin.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  firstRunWelcome: {
    label: "First-run welcome canvas",
    description:
      "Full-page Cartwright welcome canvas on the homepage of an untouched scaffold — disappears permanently once the site gets its own design, copy, products or completed setup. Suppresses the welcome-guide modal while active.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  reviews: {
    label: "Reviews",
    description: "ProductReview system: submission, moderation, rendering, AggregateRating JSON-LD.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  breadcrumbs: {
    label: "Visible breadcrumbs",
    description:
      "Hierarchical breadcrumb navigation on storefront pages (category, all-products, services, blog) — shows the path from the homepage to the current page. Mirrors the BreadcrumbList JSON-LD the pages already emit. Default off → byte-identical until enabled.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  currencySwitcher: {
    label: "Currency switcher",
    description: "Customer-facing currency switcher in the header.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "minCurrencies", value: 2 },
    implemented: true,
  },
  multiCurrency: {
    label: "Multi-currency charging",
    description:
      "Charge the customer in the selected currency (Stripe + order snapshot), not just display the price.",
    group: "Commerce & protocols",
    // Charging currency is config-sovereign: the storefront, checkout and
    // payment provider must be built from the same value. A DB override could
    // otherwise make the admin claim that charging changed while the static
    // checkout wiring still used brand.config.ts.
    tier: "compile-time",
    dependsOn: ["currencySwitcher"],
    precondition: { kind: "minCurrencies", value: 2 },
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  fxAutoUpdate: {
    label: "FX auto-refresh",
    description:
      "Daily cron fetches ECB reference rates and writes DB overrides, while supportedCurrencies remains the fallback anchor.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "minCurrencies", value: 2 },
    implemented: true,
  },
  sheetsSync: {
    label: "Google Sheets catalog sync",
    description:
      "Two-way synchronization between Google Sheets and the product catalog via the shared Google OAuth connector.",
    group: "Commerce & protocols",
    tier: "runtime",
    implemented: true,
  },
  phoneWidget: {
    label: "Phone widget",
    description: "Phone.inc click-to-call/chat widget in the corner of the storefront.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  announcementBar: {
    label: "Announcement bar",
    description: "Promo strip at the top of the storefront.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },

  // ─── Modern web platform (runtime) ────────────────────────────────────────
  containerQueries: {
    label: "Container queries",
    description: "ProductCard adapts to its own width via @container instead of viewport breakpoints.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  popoverApi: {
    label: "Popover/dialog API",
    description: "Modal/drawer surfaces use native <dialog> + the Popover API with a React fallback.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  viewTransitions: {
    label: "View Transitions",
    description: "Smooth morphing transitions (ProductCard → PDP) via document.startViewTransition().",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  threeD: {
    label: "Live Canvas (3D)",
    description:
      "AI-configurable Three.js 3D hero (WebGL2). CWV-safe, theme-colored, lazy. Scene/intensity is set in /admin/three-d.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  genomeResolve: {
    label: "Resolvable Genome",
    description:
      "Registered genome copy fields (e.g. footer.tagline) render via readField() = override ?? resolved-cache ?? anchor, harmonized against the identity anchors. Render never calls an LLM; resolution is triggered in /admin/genome.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  genomeEntityCopy: {
    label: "Per-entity voiced copy",
    description:
      "PDP/PLP prefer a genome entity-override for a product/category description over the entity's own text. Set overrides via the genome.set_entity_copy tool. Default-off → render byte-identical.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  verticalPresets: {
    label: "Vertical / Voice presets",
    description:
      "Packaged industry voices (kindergarten, carpenter, café, salon) on /admin/verticals — apply identity anchors + pre-written genome copy to re-tone the homepage in one click, optionally with a suggested design. Orthogonal to the skin (mix any Voice with any design). The applied copy shows on the storefront when genomeResolve is on. Default-off: hides the admin panel; nothing is applied until enabled.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  mixerPreviewEnabled: {
    label: "Mixer preview route",
    description:
      "Enables /<locale>/mixer-preview?design=&vertical= — renders any Skin × Voice combination ephemerally (no DB write, always noindex) so the public mixer on cartwright.app can iframe it. Default-off: in production the route 404s (canary-safe); in dev it always renders.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  annotateEdit: {
    label: "In-place copy editing",
    description:
      "Admin clicks a copy element on the live storefront → writes a note → AI proposes new text → before/after diff → confirm. Writes via the tool registry (genome.set / settings.update_copy / pages.upsert / products.update / categories.upsert) with plan-first confirmation + audit. Only visible to admins; default off = no overlay/attributes.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  designSurfaces: {
    label: "Design-adaptive pages (cart/checkout/account …)",
    description:
      "Backend follows frontend: cart, checkout, account (+subpages), blog, services, cases, pricing and the order confirmation adopt the active design's expression (palette tokens + display typography + DesignPages cart/checkout/account templates when the pack has them). Default off = every page renders byte-identical to today.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  sectionLayout: {
    label: "Section layout override (studio)",
    description:
      "AI agents can reorder/hide sections of the studio homepage via layoutJson. Other design packs ignore the field.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  visualBuilderEnabled: {
    label: "Visual Builder",
    description:
      "Admin-only visual designer layer (/admin/visual-builder): build/edit per-page section trees via live preview + inspector. All mutation goes through pages.set_layout (tool registry + audit). Route-mount gated → requires redeploy.",
    group: "Modern web platform",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  designImport: {
    label: "Design import",
    description:
      "Pull a color palette from a URL via Firecrawl + AI → themeJson (/admin/design-import).",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  docsImport: {
    label: "Google Docs import",
    description:
      "Import a Google Doc as a draft blog post or /info page via the existing Google OAuth connector (/admin/docs-import).",
    group: "Discovery & AI",
    tier: "runtime",
    implemented: true,
  },
  seoAutopilot: {
    label: "SEO/GEO Autopilot (Pro)",
    description:
      "Measures search performance (GSC) + AI citation, and runs self-improving genome experiments (apply→measure→keep/revert). Pro (cartwrightPlus). /admin/seo-performance.",
    group: "Discovery & AI",
    tier: "runtime",
    dependsOn: ["cartwrightPlus"],
    implemented: true,
  },
  hoptify: {
    label: "Hoptify onboarding",
    description:
      "Parody “import from Shopify” (/admin/hoptify): hybrid theater + real import (palette + products) when FIRECRAWL_API_KEY is present.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  siteImport: {
    label: "Site-import (rebuild as drafts)",
    description:
      "content.import_site: scrape an existing site (Firecrawl) and rebuild it as Cartwright drafts (pages/services/blog + hero images) for review. Default-off until the admin review UI ships.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  sitePack: {
    label: "SitePack (export/import a whole site)",
    description:
      "sitepack.export / .import: snapshot the entire site (design + content + products + media + branding) as a portable .cartpack and restore it onto a newer Cartwright. Default-off until the admin Snapshot/Restore UI ships.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  logoGenerator: {
    label: "Logo generator (Gemini)",
    description:
      "Generate a raster logo from a prompt via gemini-2.5-flash-image → Vercel Blob → logoImageUrl (/admin/indstillinger). Requires a Gemini key + BLOB_READ_WRITE_TOKEN.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  v0Generator: {
    label: "v0 UI generation",
    description:
      "Generate storefront sections via the Vercel v0 Platform API (text→UI) as an alternative AI engine in the Vibe Sandbox. v0's code is normalized to HTML + sanitized and persisted as vibeHtml (never TSX-to-disk). Requires a v0 key in /admin/integrations.",
    group: "Modern web platform",
    tier: "runtime",
    implemented: true,
  },
  githubAuth: {
    label: "Sign in with GitHub",
    description:
      "Continue-with-GitHub button on login next to the magic link. Requires GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET in env. GitHub login creates/links a customer — never an admin.",
    group: "Storefront UX",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  googleAuth: {
    label: "Google sign-in",
    description:
      "Continue-with-Google button on login next to the magic link. Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in env. Google login creates/links a customer — never an admin.",
    group: "Storefront UX",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  googleDrive: {
    label: "Google Drive import + backup",
    description:
      "Import images from a configured Drive folder into MediaAsset/Vercel Blob, and send logical DB backups to Drive. Uses the shared Google Workspace OAuth2 connector.",
    group: "Discovery & AI",
    tier: "runtime",
    dependsOn: ["mediaLibrary"],
    implemented: true,
  },
  blog: {
    label: "Blog",
    description:
      "Blog at /blog (list + post), RSS feed, BlogPosting JSON-LD + sitemap. Posts are edited in /admin/blog.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },
  stripeTax: {
    label: "Stripe Tax (VAT)",
    description:
      "Managed multi-country VAT calculation via Stripe Tax (EU OSS, VAT ID validation). Off → built-in single rate (policies.vatRatePct).",
    group: "Compliance & privacy",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  subscriptions: {
    label: "Subscriptions",
    description:
      "Recurring billing via Stripe Billing subscriptions: Checkout Session, customer portal in /account/subscriptions and an admin overview.",
    group: "Commerce & protocols",
    tier: "compile-time",
    precondition: { kind: "ecommerce" },
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  shippingZones: {
    label: "Shipping zones",
    description:
      "Zone/weight-based shipping + delivery times (/admin/shipping). Off = flat-rate shipping.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  wishlist: {
    label: "Wishlist",
    description:
      "Heart button on product cards + PDP, and /account/wishlist. Logged-in users.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  abandonedCart: {
    label: "Abandoned cart email",
    description:
      "Cart-recovery email to logged-in customers with an inactive cart (cron). Transactional.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  marketingAutomations: {
    label: "Marketing automations (Resend)",
    description:
      "Emits lifecycle events (welcome / abandoned-cart / post-purchase) to Resend Automations, which runs the drip sequences. Cartwright only sends events; the owner wires the sequences in Resend. Consent-gated; requires a Resend key.",
    group: "Storefront UX",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  contactAttachments: {
    label: "Contact attachments",
    description:
      "Lets visitors attach an image to the contact form via a public, tightly constrained upload endpoint (images only, ≤5MB, magic bytes, rate-limited). Requires BLOB_READ_WRITE_TOKEN. Default-off.",
    group: "Storefront UX",
    tier: "runtime",
    implemented: true,
  },

  // ─── Ordrestyring (HPOS-grade order management, runtime) ──────────────────
  orderWorkspace: {
    label: "Order workspace",
    description:
      "HPOS-style order management: status tabs, filter/search/pagination, bulk actions, order notes/timeline, tracking entry and manual refund in the order detail. Off = the old bare order table.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  fulfillmentPdf: {
    label: "Pick/packing slip (PDF)",
    description:
      "Print-friendly pick list + packing slip per order/supplier (HTML print → Save as PDF). Builds on fulfillment routing.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    dependsOn: ["orderWorkspace"],
    implemented: true,
  },
  returns: {
    label: "Returns (RMA)",
    description:
      "Admin-initiated returns: register a return + reason, issue a refund and auto-restock from the order workspace. No customer portal.",
    group: "Commerce & protocols",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    dependsOn: ["orderWorkspace"],
    implemented: true,
  },
  orderAi: {
    label: "AI next steps (orders)",
    description:
      "Rule-based + optionally LLM-generated suggestions for the next action on an order (ship, follow up, refund, investigate flags).",
    group: "Discovery & AI",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    dependsOn: ["orderWorkspace"],
    implemented: true,
  },

  // ─── Platform (runtime) ───────────────────────────────────────────────────
  cartwrightPlus: {
    label: "Cartwright Plus",
    description: "Honor-system Pro-tier signal. Only affects the display of “⭐ Pro” badges in the admin.",
    group: "Platform",
    tier: "runtime",
    implemented: true,
  },
  mcpPublic: {
    label: "Public MCP",
    description:
      "Expose /api/mcp + /api/v1/tools publicly (discovery signal for AI-first shops). Off ⇒ the routes answer 404 (enforced).",
    group: "Discovery & AI",
    tier: "runtime",
    implemented: true,
  },
  webMcp: {
    label: "WebMCP (in-browser tools)",
    description:
      "Expose the storefront as browser-native WebMCP tools for in-browser AI agents (document.modelContext): site-wide search/cart reading/navigation plus CONTEXTUAL per-page tools — the catalogue page lists and filters the visible assortment, the PDP offers add-to-cart for its own product, the cart page edit/remove/go-to-checkout — plus declarative form annotations (search, contact, newsletter; only search may auto-submit) and design-pack tools (e.g. Crema's brew-ratio calculator). Checkout is deliberately tool-free: buying stays a human action. W3C draft — works today in ChatGPT's built-in browser and Chrome (origin trial / flag); inventory at /webmcp-check.",
    group: "Discovery & AI",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },

  // ─── Commerce & protocols (compile-time) ──────────────────────────────────
  webshop: {
    label: "Webshop",
    description: "Cart/checkout routes + add-to-cart UI. Mirrors brand.mode === \"webshop\".",
    group: "Commerce & protocols",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  acp: {
    label: "Agentic Commerce Protocol",
    description: "ACP checkout endpoints (/api/acp/*). Mirrors acp.enabled.",
    group: "Commerce & protocols",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  a2a: {
    label: "Agent-to-Agent",
    description: "A2A endpoints (agent-card, negotiate, escrow/verify). 404 when off.",
    group: "Commerce & protocols",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  adminAgenticDashboard: {
    label: "Agentic admin dashboard",
    description: "/admin/agentic (live A2A transactions, escrow queue, policy editor).",
    group: "Commerce & protocols",
    tier: "compile-time",
    dependsOn: ["a2a"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  voiceShop: {
    label: "Voice shopping",
    description: "Voice shopping via Gemini Live (mic FAB). Also requires an admin toggle + a Gemini key.",
    group: "Commerce & protocols",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },

  // ─── Compliance & privacy (compile-time) ──────────────────────────────────
  consentBanner: {
    label: "Cookie consent",
    description: "EU 3-category cookie consent banner. Prerequisite for GA4.",
    group: "Compliance & privacy",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  analyticsGa4: {
    label: "Google Analytics 4",
    description: "GA4 script — only loads after consent. Privacy-sensitive, hence build-time gated.",
    group: "Compliance & privacy",
    tier: "compile-time",
    dependsOn: ["consentBanner"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },

  // ─── Discovery & AI ───────────────────────────────────────────────────────
  mediaLibrary: {
    label: "Media library",
    description: "Central MediaAsset library + ProductMedia join.",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  aeoContent: {
    label: "AEO product content",
    description:
      "Answer-first product content: summary, FAQ, use cases, comparison + FAQPage JSON-LD + answer-first sections on the PDP. The fields are nullable/lossless; the flag gates UI visibility + JSON-LD.",
    group: "Discovery & AI",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  merchantFeed: {
    label: "Google Merchant feed",
    description:
      "Google Shopping XML product feed at /feed/google.xml (reuses the catalog feed). Off → 404. The operator registers the URL in Merchant Center themselves.",
    group: "Discovery & AI",
    tier: "runtime",
    precondition: { kind: "ecommerce" },
    implemented: true,
  },
  hreflang: {
    label: "hreflang alternates",
    description:
      "hreflang alternates (per-locale + x-default) on PDP + category metadata via i18n/routing. Auto-empty on single-locale shops.",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  leadAiTriage: {
    label: "AI lead triage",
    description:
      "Priority, summary and a draft reply for incoming contact inquiries, generated AFTER the response is sent (after()) — never on the visitor's critical path. Requires an Anthropic key; without it the triage is silently skipped. Shown in /admin/leads.",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  altTextAi: {
    label: "AI alt text",
    description:
      "Gemini vision-generated alt text/caption/geoSnippet/colors on upload, async via the cron /api/cron/media-ai (gated on this flag). Edited in /admin/media.",
    group: "Discovery & AI",
    tier: "compile-time",
    dependsOn: ["mediaLibrary"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  tryOn: {
    label: "Virtual try-on",
    description: "AR virtual try-on (eyewear-specific). (Defined, not wired yet.)",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: false,
  },
  ucpIdentityLinking: {
    label: "UCP identity-linking (OAuth)",
    description:
      "UCP dev.ucp.common.identity_linking: OAuth 2.0 Authorization Code + PKCE so agents can act on a user's behalf across merchants. Exposes /.well-known/oauth-authorization-server + /oauth/{authorize,token,revoke,register} and a spec-shaped capability in /.well-known/ucp. Default-off; run db:push (OAuthClient/OAuthAuthCode/OAuthToken) before enabling. See docs/HUL-D-UCP-IDENTITY-LINKING.md.",
    group: "Commerce & protocols",
    tier: "runtime",
    implemented: true,
  },

  // ─── Magic Builder (prompt-drevet sidebygning) ────────────────────────────
  magicBuilder: {
    label: "Magic Builder",
    description:
      "Prompt-driven 'build a whole page' layer in /admin/visual-builder: describe a page → AI lays out a plan of whitelisted section keys → each section is filled by generateObject against the section's own Zod schema (the model never picks tag/color/font) → sections stream live into the preview (hot reload) → published governed + revertible via pages.set_layout. Compile-time (panel mount). Requires redeploy.",
    group: "Modern web platform",
    tier: "compile-time",
    dependsOn: ["visualBuilderEnabled"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },
  componentRegistryPublic: {
    label: "Component registry (public)",
    description:
      "Public shadcn-compatible registry at /api/registry: exposes the section catalog's prop JSON Schema (zodToJsonSchema) so external AI agents/IDEs can read what each Cartwright section accepts. Read-only; 404 when off.",
    group: "Discovery & AI",
    tier: "runtime",
    implemented: true,
  },
  lookSharing: {
    label: "Look sharing (public remix)",
    description:
      "Serves this shop's look as a cartwright-composition-v1 artifact on GET /api/look — cosmetic fields only (skin, palette, scene, chrome); copy overrides, voice identity and the homepage layout are never exposed. Adds a 'Remix this look' block to /built-with-cartwright. 404 when off.",
    group: "Discovery & AI",
    tier: "runtime",
    implemented: true,
  },
  componentRegistryShipsSource: {
    label: "Registry: ship component source",
    description:
      "Sub-flag for the component registry: in addition to schema, also serve actual MIT-licensed TSX (+ local sibling deps) for a curated, self-contained subset of Studio atoms (installable shadcn source via `npx shadcn add`). The source is embedded at build time (scripts/build-registry-source.ts → lib/magic/registry-source.ts). Never proprietary/server-importing/third-party code.",
    group: "Discovery & AI",
    tier: "runtime",
    dependsOn: ["componentRegistryPublic"],
    implemented: true,
  },
  registryStats: {
    label: "Registry: install statistics",
    description:
      "Anonymous install counting on the public component registry: every served registry item (section key or svg item) increments a per-item counter — ONLY the item slug, never IP/UA/visitor data. Fire-and-forget (never blocks/fails the registry response); off ⇒ zero counter reads/writes. Read sorted at /admin/registry-stats + GET /api/admin/registry-stats. Run `pnpm db:push` (RegistryHit model) before enabling.",
    group: "Discovery & AI",
    tier: "runtime",
    dependsOn: ["componentRegistryPublic"],
    implemented: true,
  },

  // ─── Motion & Effects (scroll-driven animations + presets) ────────────────
  motionEffects: {
    label: "Motion & effects",
    description:
      "Makes the pages feel 'alive': scroll-driven reveal animations (CSS animation-timeline: view() — runs on the compositor thread, no JS jank), animated aurora gradient + glassmorphism, and a per-section effect vocabulary Magic Builder can assign. A shop preset (subtle/bold/off) scales the whole feel via data-motion on <html>. Everything feature-detected (@supports) + prefers-reduced-motion-safe + falls back to a static render (RevealOnScroll). Off ⇒ data-motion=\"off\" ⇒ byte-identical render (canary-safe).",
    group: "Modern web platform",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: true,
  },

  // ─── Speculation Rules (document-level prefetch) ──────────────────────────
  speculationRules: {
    label: "Speculation Rules (prefetch)",
    description:
      "Emits a document-level <script type=\"speculationrules\"> so Chromium prefetches likely next navigations (product/cart/checkout, excluding /admin + /api + [data-no-prefetch]) at `moderate` eagerness — faster PLP→PDP→checkout without leaving the server model. Progressive enhancement: ignored in browsers without support (Firefox/Safari), so no behavior change there. `type=\"speculationrules\"` is NOT executable JS (no CSP script-src concern). Off ⇒ no script emitted ⇒ byte-identical render (canary-safe).",
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
    description: "website / webshop / agent-marketplace — top-level identity.",
  },
  {
    key: "ecommerceEnabled",
    label: "E-commerce enabled",
    description: "Gates core shop routes. Sovereign from brand.config (Phase G/H guard).",
  },
  {
    key: "industryTemplate",
    label: "Industry template",
    description: "Selects seed data (coffee/sunglasses/saas/…).",
  },
] as const;
