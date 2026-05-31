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
  designImport: {
    label: "Design-import",
    description:
      "Træk en farvepalette fra en URL ind via Firecrawl + AI → themeJson (/admin/design-import).",
    group: "Modern web platform",
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
  hreflang: {
    label: "hreflang-alternates",
    description: "hreflang-alternates på PDP + kategori. (Defineret, endnu ikke wired.)",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: false,
  },
  altTextAi: {
    label: "AI alt-tekst",
    description: "Gemini-genereret alt-text/SEO/GEO ved upload. (Defineret, endnu ikke wired.)",
    group: "Discovery & AI",
    tier: "compile-time",
    dependsOn: ["mediaLibrary"],
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: false,
  },
  tryOn: {
    label: "Virtual try-on",
    description: "AR virtual try-on (eyewear-specifikt). (Defineret, endnu ikke wired.)",
    group: "Discovery & AI",
    tier: "compile-time",
    requiresRedeployNote: REDEPLOY_NOTE,
    implemented: false,
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
