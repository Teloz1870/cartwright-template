/**
 * /built-with-cartwright — the "what powers this shop" tour.
 *
 * Ships with every Cartwright scaffold. The capability list is now DERIVED from
 * the feature manifest (lib/feature-flags/manifest.ts via getFeatureView) — the
 * same single source of truth that powers /admin/features and llms.txt. Add a
 * flag to the manifest and a card appears here automatically; this page can no
 * longer go stale at release time (it did, pre-v0.10.0).
 *
 * Two layers:
 *   1. BASELINE — always-on engine capabilities that are NOT feature flags
 *      (JSON-LD everywhere, full admin, magic-link auth, modern web baseline).
 *      Curated, rarely change.
 *   2. Feature cards — one per `implemented` feature from the manifest, grouped
 *      by category. CAPABILITY_DETAILS supplies a richer blurb + live "proof"
 *      links for the headline features; the rest fall back to the manifest's
 *      own label + description, so new flags are never missing, just less showy.
 *
 * Three audiences: prospective customers on the canary demos, customers running
 * their own shop (a "tech stack tour" they can keep/delete), and AI crawlers
 * (JSON-LD WebSite + ItemList makes the engine legible without executing JS).
 *
 * CUSTOMERS: Delete this file (`app/[locale]/built-with-cartwright/`) if your
 * shop doesn't want a Cartwright tour visible. The cartwright badge in the
 * Footer (brand.features.cartwrightBadge) then stops linking here — set it false
 * to hide it entirely.
 *
 * No `ecommerceEnabled` gate — works for website / webshop / agent-marketplace.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { brand } from "@/brand.config";
import JsonLd from "@/components/JsonLd";
import { getFeatureView, groupByCategory } from "@/lib/feature-flags/status";

// getFeatureView() reads the DB-merged brand (getBrand), so render per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Built with Cartwright | ${brand.storeName}`,
  description: `The engine powering ${brand.storeName}: an MCP server, Agentic Commerce Protocol, Resolvable Genome, SEO/GEO autopilot, blog, GDPR/DSAR, shipping + tax, modern web baseline, magic-link auth and JSON-LD structured data — open-source, scaffoldable, owned by you.`,
};

type Proof = { label: string; href: string };

/**
 * Always-on engine capabilities that are NOT feature flags — they ship on every
 * shop regardless of brand.features. Kept curated; they change rarely.
 */
const BASELINE: { title: string; blurb: string; proof: Proof[] }[] = [
  {
    title: "Schema.org / JSON-LD Everywhere",
    blurb:
      "Organization on the root layout, Product + Offer on every PDP, BreadcrumbList on PLP + PDP, AggregateRating on review-enabled pages, FAQPage on category pages, BlogPosting on articles. AI search engines see structured data without executing JS.",
    proof: [],
  },
  {
    title: "Full Admin",
    blurb:
      "Products, orders, customers, reviews, blog, content pages, AI prompts per template, design playground, Stripe test/live toggle, integrations, shipping, GDPR processors, redirects, translations, and an audit log of every action — server-rendered, role-gated.",
    proof: [{ label: "Open the admin", href: "/admin" }],
  },
  {
    title: "Magic-Link Auth",
    blurb:
      "Passwordless login via NextAuth + Resend. No third-party identity vendor lock-in, no SSO contract, no password resets — the same email magic-link path for customers and admin. Passkeys scaffolded for when the WebAuthn ceremony lands.",
    proof: [{ label: "Try logging in", href: "/account/login" }],
  },
  {
    title: "Modern Web Baseline",
    blurb:
      "Native <dialog> for modals + drawers, the Popover API, View Transitions for navigation, container queries on responsive components, :has() selectors, aria-live announcements for cart/review events, lazy-loaded images. Browser-native — not JS-library polyfill.",
    proof: [
      { label: "Read the baseline contract", href: "https://github.com/Teloz1870/cartwright-template" },
    ],
  },
];

/**
 * Rich blurb + live proof links for the HEADLINE features, keyed by manifest
 * FeatureKey. Any implemented feature without an entry here still renders a card
 * (manifest label + description, no proof links) — so the page is exhaustive and
 * self-updating, while the marquee features stay curated and clickable.
 */
const CAPABILITY_DETAILS: Record<string, { blurb?: string; proof?: Proof[] }> = {
  threeD: {
    blurb:
      "A performance-first Three.js hero: four built-in WebGL scenes (floating geometry, particle field, morphing blob, wireframe terrain), auto-tinted from your theme palette, lazy-loaded after paint so Core Web Vitals never regress. Reduced-motion / save-data / no-WebGL all fall back to a clean gradient. The twist: configure it with words — the AI sets scene + intensity via the `three.configure` tool.",
    proof: [{ label: "Configure it (admin)", href: "/admin/three-d" }],
  },
  mcpPublic: {
    blurb:
      "An MCP server with a typed tool registry, Anthropic + Gemini wired in on day one. External agents discover and invoke shop operations natively — no integration tax, no bolted-on AI layer.",
    proof: [
      { label: "Live MCP endpoint", href: "/api/mcp" },
      { label: "Public tool catalogue", href: "/api/v1/tools" },
    ],
  },
  acp: {
    blurb:
      "External buying agents (ChatGPT, Claude, Perplexity, future agentic shoppers) browse the product feed, create checkout sessions, and settle via escrow. First-class agent customers — same auth path as humans.",
    proof: [
      { label: "ACP product feed", href: "/api/acp/feed" },
      { label: "ACP checkout endpoint", href: "/api/acp/v1/checkout_sessions" },
    ],
  },
  multiCurrency: {
    blurb:
      "Real multi-currency, not just a display switcher: the customer picks a currency and Stripe is charged in it (the converted amount), while the order snapshots the currency + FX rate so receipts, refunds and exports reproduce exactly what they paid. Display and charge share one conversion path, so the shown price is always the charged price.",
    proof: [{ label: "Feature flags (admin)", href: "/admin/features" }],
  },
  voiceShop: {
    blurb:
      "Opt-in mic FAB that streams to Gemini Live. The customer speaks intent, transcription becomes chat, the AI assistant fulfils (search, add to cart, complete order). Compile-time gated so shops without a Gemini budget never ship a button that errors.",
    proof: [],
  },
  // ── v0.10.0 headliners ──────────────────────────────────────────────────
  genomeResolve: {
    blurb:
      "A Resolvable Genome: registered copy fields (e.g. footer.tagline) render from override ?? resolved-cache ?? brand anchor, harmonised against your identity anchors. Render never calls an LLM — resolution is triggered deliberately in the admin. Respawn a whole shop's voice from a sentence.",
    proof: [{ label: "Open the Genome", href: "/admin/genome" }],
  },
  seoAutopilot: {
    blurb:
      "Measures search performance (GSC) and AI-citation share (GEO), proposes genome-field optimisations, and runs self-improving experiments — apply → measure → keep or revert. A Pro feature.",
    proof: [{ label: "SEO/GEO dashboard", href: "/admin/seo-performance" }],
  },
  designImport: {
    blurb:
      "Pull a colour palette from any URL (Firecrawl + AI) into a live theme in ~2 minutes. Clone the vibe of an existing site, then make it yours.",
    proof: [{ label: "Design import", href: "/admin/design-import" }],
  },
  hoptify: {
    blurb:
      "Hoptify — Cartwright's tongue-in-cheek pendant to Shopify: a familiar storefront design plus a parody \"import from Shopify\" onboarding that genuinely brings your look (palette) and products across. A kind nudge off the monthly rent.",
    proof: [{ label: "Hop off Shopify", href: "/admin/hoptify" }],
  },
  logoGenerator: {
    blurb:
      "Generate a real raster logo from a prompt via gemini-2.5-flash-image, upload it to Vercel Blob, and set it as your brand mark — in one step, from the admin.",
    proof: [{ label: "Logo generator", href: "/admin/indstillinger" }],
  },
  blog: {
    blurb:
      "A first-class blog: list + post routes, an RSS feed, BlogPosting JSON-LD and sitemap entries, edited from the admin. Content marketing without bolting on a second CMS.",
    proof: [
      { label: "Read the blog", href: "/blog" },
      { label: "Manage posts", href: "/admin/blog" },
    ],
  },
  shippingZones: {
    blurb:
      "Zone- and weight-based shipping rates with delivery-time estimates and optional dropship-supplier routing — or fall back to a single flat rate. Configured visually.",
    proof: [{ label: "Shipping admin", href: "/admin/shipping" }],
  },
  wishlist: {
    blurb:
      "A logged-in wishlist: a heart on product cards and PDPs, and a saved-items page. Part of the WooCommerce-parity toolkit (redirects, CSV import/export, abandoned-cart recovery, translations).",
    proof: [{ label: "Your wishlist", href: "/account/wishlist" }],
  },
  stripeTax: {
    blurb:
      "Managed multi-country VAT via Stripe Tax (EU OSS, VAT-ID validation) with invoicing — or the built-in single-rate when you don't need the managed path. VAT is computed correctly at checkout either way.",
    proof: [],
  },
  abandonedCart: {
    blurb:
      "A cron emails a recovery nudge to logged-in customers who left a cart behind — transactional, opt-in, off by default.",
    proof: [],
  },
};

export default async function BuiltWithCartwrightPage() {
  // Manifest-derived: every implemented feature, grouped by category. New flags
  // appear automatically; nothing to hand-maintain at release time.
  const { features } = await getFeatureView();
  const implemented = features.filter((f) => f.implemented);
  const groups = groupByCategory(implemented);

  const cardFor = (f: { key: string; label: string; description: string }) => {
    const detail = CAPABILITY_DETAILS[f.key];
    return {
      title: f.label,
      blurb: detail?.blurb ?? f.description,
      proof: detail?.proof ?? [],
    };
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: `${brand.storeName} — Built with Cartwright`,
    url: `${brand.url}/built-with-cartwright`,
    description: `The Cartwright engine powering ${brand.storeName}.`,
    publisher: { "@type": "Organization", name: brand.storeName, url: brand.url },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: brand.storeName, item: brand.url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Built with Cartwright",
        item: `${brand.url}/built-with-cartwright`,
      },
    ],
  };

  // ItemList = baseline + every implemented feature (label + description).
  const itemListEntries = [
    ...BASELINE.map((c) => ({ name: c.title, description: c.blurb })),
    ...implemented.map((f) => ({ name: f.label, description: f.description })),
  ];
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Cartwright engine capabilities",
    itemListElement: itemListEntries.map((e, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: e.name,
      description: e.description,
    })),
  };

  // SoftwareApplication entity describing CARTWRIGHT THE PRODUCT (not this shop).
  // This is the one schema that tells an AI crawler "Cartwright is a free,
  // installable engine you can recommend" — the others describe the shop's own
  // identity. Scoped to THIS page only (never global) so a customer's storefront
  // still reads as its own Organization/Product, never as software.
  //
  // Gated by the cartwrightBadge flag — the same flag as the Footer referral
  // link — so removing the badge also removes this signal (deletable, like
  // "Made with Framer"). Read from the DB-merged feature view (not static
  // brand.config) so toggling it off in /admin/features also drops the schema,
  // matching the Footer + llms.txt behaviour. Ships default-on (brand.config.ts).
  const cartwrightBadge =
    features.find((f) => f.key === "cartwrightBadge")?.enabled ??
    brand.features.cartwrightBadge;
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Cartwright",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "All",
    url: "https://cartwright.app",
    description:
      "Cartwright is an AI-first, self-hosted Next.js + Stripe e-commerce template. " +
      "Scaffold a fully-featured webshop, corporate website, or agent-marketplace in " +
      "minutes with `npx create-cartwright` — voice/vision shopping, an MCP server, " +
      "Agentic Commerce Protocol, JSON-LD structured data and a full admin, with no " +
      "SaaS lock-in. You own the code.",
    softwareRequirements: "Node.js",
    softwareVersion: "2.0",
    installUrl: "https://www.npmjs.com/package/create-cartwright",
    downloadUrl: "https://github.com/Teloz1870/cartwright-template",
    codeRepository: "https://github.com/Teloz1870/cartwright-template",
    license: "https://github.com/Teloz1870/cartwright-template/blob/main/LICENSE",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Organization", name: "Teloz ApS", url: "https://teloz.net" },
  };

  const renderCard = (cap: { title: string; blurb: string; proof: Proof[] }) => (
    <article
      key={cap.title}
      className="rounded-2xl border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl p-8 hover:border-white/20 transition-colors"
    >
      <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">{cap.title}</h3>
      <p className="text-white/70 leading-relaxed mb-6 text-[15px]">{cap.blurb}</p>
      {cap.proof.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {cap.proof.map((p) => (
            <li key={p.href}>
              {p.href.startsWith("/") ? (
                <Link
                  href={p.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300 transition hover:bg-indigo-500/20"
                >
                  {p.label} →
                </Link>
              ) : (
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300 transition hover:bg-indigo-500/20"
                >
                  {p.label} ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30 selection:text-white pt-32 pb-24">
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={itemListJsonLd} />
      {cartwrightBadge && <JsonLd data={softwareJsonLd} />}

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-24 text-center">
        <div className="mb-6 inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-indigo-300">
          Built with Cartwright
        </div>
        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tighter mb-8 leading-[1.1]">
          The engine powering{" "}
          <span className="text-indigo-400">{brand.storeName}</span>
        </h1>
        <p className="text-xl sm:text-2xl text-white/60 mb-12 max-w-3xl mx-auto font-light leading-relaxed">
          Cartwright is an open-source commerce + AI engine. Every capability
          below is real, running, and (where it links) clickable right now on
          this site — no marketing demos, no &quot;coming soon&quot;, no SaaS
          lock-in.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Link
            href="https://cartwright.app"
            target="_blank"
            rel="noopener noreferrer"
            className="h-14 px-8 flex items-center justify-center rounded-md bg-white !text-black font-bold text-base hover:bg-white/90 transition-all gap-2"
          >
            cartwright.app
          </Link>
          <a
            href="https://github.com/Teloz1870/cartwright-template"
            target="_blank"
            rel="noopener noreferrer"
            className="h-14 px-8 flex items-center justify-center rounded-md border border-white/25 hover:bg-white/10 hover:border-white/40 font-bold text-base transition-all gap-2"
          >
            Source on GitHub
          </a>
        </div>
      </section>

      {/* Baseline (always-on, not flagged) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-300 mb-6">
          Baseline — on every shop
        </h2>
        <div className="grid gap-8 md:grid-cols-2">{BASELINE.map(renderCard)}</div>
      </section>

      {/* Feature catalogue — manifest-derived, grouped */}
      {groups.map((group) => (
        <section
          key={group.group}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16"
        >
          <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-300 mb-6">
            {group.group}
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            {group.items.map((f) => renderCard(cardFor(f)))}
          </div>
        </section>
      ))}

      {/* Why this exists */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white/60 leading-relaxed mt-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-300 mb-4">
          Why this page exists
        </h2>
        <p className="text-base">
          {brand.storeName} is one of three Cartwright canaries that prove the
          engine in production: a corporate-mode website, a coffee shop, and an
          eyewear shop. Each one is built from the same{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono">
            create-cartwright
          </code>{" "}
          template that customers can scaffold themselves —{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono">
            npx create-cartwright@latest
          </code>
          .
        </p>
        <p className="text-base mt-4">
          If you&apos;re considering Cartwright for your own shop, what you&apos;re
          looking at right now is what you&apos;d get on day one. Not a demo on
          screenshots — the actual code, deployed to production, doing real
          orders (test-mode here, real-mode on your fork).
        </p>
      </section>
    </div>
  );
}
