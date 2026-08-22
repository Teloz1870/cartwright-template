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
import { CartwrightLogo } from "@/components/CartwrightLogo";
import { WelcomeFlora } from "@/components/first-run/WelcomeFlora";
import { withBadgeAttribution } from "@/lib/attribution";
import { getFeatureView, groupByCategory } from "@/lib/feature-flags/status";
import { pageOg } from "@/lib/og";
import { profileCapabilities } from "@/lib/profile-capabilities";

// getFeatureView() reads the DB-merged brand (getBrand), so render per request.
export const dynamic = "force-dynamic";

const BWC_DESCRIPTION = profileCapabilities.agentApi
  ? `The engine powering ${brand.storeName}: an MCP server, Agentic Commerce Protocol, Resolvable Genome, SEO/GEO autopilot, blog, GDPR/DSAR, shipping + tax, modern web baseline, magic-link auth and JSON-LD structured data — open-source, scaffoldable, owned by you.`
  : `The Cartwright site profile powering ${brand.storeName}: server-rendered pages, modern web foundations and JSON-LD structured data — open-source, scaffoldable and owned by you.`;

export const metadata: Metadata = {
  title: `Built with Cartwright | ${brand.storeName}`,
  description: BWC_DESCRIPTION,
  ...pageOg("Built with Cartwright", `The engine powering ${brand.storeName} — open-source, scaffoldable, owned by you.`),
};

type Proof = { label: string; href: string };

/**
 * Always-on engine capabilities that are NOT feature flags — they ship on every
 * shop regardless of brand.features. Kept curated; they change rarely.
 */
const BASELINE: { title: string; blurb: string; proof: Proof[]; requiresPlatform?: boolean }[] = [
  {
    title: "Schema.org / JSON-LD Everywhere",
    blurb:
      "Organization on the root layout, Product + Offer on every PDP, BreadcrumbList on PLP + PDP, AggregateRating on review-enabled pages, FAQPage on category pages, BlogPosting on articles. AI search engines see structured data without executing JS.",
    proof: [],
  },
  {
    title: "Full Admin",
    requiresPlatform: true,
    blurb:
      "Products, orders, customers, reviews, blog, content pages, AI prompts per template, design playground, Stripe test/live toggle, integrations, shipping, GDPR processors, redirects, translations, and an audit log of every action — server-rendered, role-gated.",
    proof: [{ label: "Open the admin", href: "/admin" }],
  },
  {
    title: "Magic-Link Auth",
    requiresPlatform: true,
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
  {
    title: "Adaptive Design System",
    blurb:
      "One curated catalogue of ~20 section atoms powers both the flagship Aurora default (website + webshop) and the Magic Builder — so the homepage and the builder are the same components. Every section is palette-adaptive: pick your brand colours once and the whole design re-skins itself (the model never hand-picks a hex). Switch design packs without re-theming.",
    proof: [],
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
      "External buying agents (ChatGPT, Claude, Perplexity, future agentic shoppers) browse the product feed, create checkout sessions, and complete the purchase via delegated payment (Stripe Shared Payment Token). First-class agent customers — same auth path as humans.",
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
  // ── Magic Builder + design distribution ───────────────────────────────────
  magicBuilder: {
    blurb:
      "Describe a page in plain language and watch it build itself — section by section, live in the preview. The inverse of code-generators: the prompt can only emit a plan of whitelisted, on-brand section atoms, each filled with Zod-validated data (never a tag, colour or font the model invented). Output lives as governed data — audited, one-click revertible — not throwaway code.",
    proof: [{ label: "Open the builder (admin)", href: "/admin/visual-builder" }],
  },
  componentRegistryPublic: {
    blurb:
      "A public, shadcn-compatible component registry: every catalogue section exposes its prop JSON-Schema so external AI agents and IDEs can discover and target Cartwright sections. The design system is a hub other tools can read, not a closed silo.",
    proof: [{ label: "Registry endpoint", href: "/api/registry" }],
  },
  // ── v0.25.0 agentic-web ───────────────────────────────────────────────────
  ucpIdentityLinking: {
    blurb:
      "A full OAuth 2.0 (Authorization Code + PKCE) authorization server implementing UCP `dev.ucp.common.identity_linking`, so an agentic platform can act on a shopper's behalf across merchants — with a consent screen, scoped tokens, refresh-rotation + reuse-detection, and client-bound revocation. Only token hashes are stored.",
    proof: [{ label: "Authorization-server metadata", href: "/.well-known/oauth-authorization-server" }],
  },
  webMcp: {
    blurb:
      "WebMCP brings agent tools into the browser tab: the storefront registers search_products, get_cart, add_to_cart and a same-origin navigate via document.modelContext, so an in-browser AI agent acts reliably instead of scraping the DOM. Experimental (Chrome origin-trial, W3C draft), default-off.",
    proof: [],
  },
};

export default async function BuiltWithCartwrightPage() {
  // Manifest-derived: every implemented feature, grouped by category. New flags
  // appear automatically; nothing to hand-maintain at release time.
  const { features } = await getFeatureView();
  const implemented = features.filter(
    (f) =>
      f.implemented &&
      (profileCapabilities.publicFeatureKeys === null ||
        profileCapabilities.publicFeatureKeys.includes(f.key)),
  );
  const groups = groupByCategory(implemented);
  const baseline = BASELINE.filter(
    (capability) =>
      !capability.requiresPlatform || profileCapabilities.accountAndAdmin,
  );

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
    ...baseline.map((c) => ({ name: c.title, description: c.blurb })),
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

  // "Remix this look" — only when the shop has opted into public look-sharing
  // (lookSharing runtime flag; GET /api/look 404s when off, so the block and
  // the endpoint appear/disappear together). DB-merged view, same as above.
  const lookSharing = profileCapabilities.agentApi &&
    (features.find((f) => f.key === "lookSharing")?.enabled ?? false);
  const remixCommand = `npx create-cartwright --look ${brand.url.replace(/\/$/, "")}/api/look`;
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
    installUrl: "https://www.npmjs.com/package/create-cartwright",
    downloadUrl: "https://github.com/Teloz1870/cartwright-template",
    codeRepository: "https://github.com/Teloz1870/cartwright-template",
    license: "https://github.com/Teloz1870/cartwright-template/blob/main/LICENSE",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Organization", name: "Cartwright", url: "https://cartwright.app" },
  };

  const renderCard = (cap: { title: string; blurb: string; proof: Proof[] }) => (
    <article
      key={cap.title}
      className="rounded-3xl border border-cw-stone-200 bg-cw-stone-50/95 backdrop-blur p-7 shadow-[0_30px_70px_-36px_rgba(23,20,17,0.4)] transition duration-300 hover:-translate-y-1 hover:border-[var(--cw-brand)]/40 hover:shadow-[0_44px_80px_-32px_var(--cw-brand-shadow-soft)]"
    >
      <h3 className="mb-2 text-xl font-semibold tracking-tight text-cw-stone-900">{cap.title}</h3>
      <p className="mb-5 text-[14px] leading-relaxed text-cw-stone-600">{cap.blurb}</p>
      {cap.proof.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {cap.proof.map((p) => (
            <li key={p.href}>
              {p.href.startsWith("/") ? (
                <Link
                  href={p.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cw-brand)]/40 bg-[var(--cw-brand)]/10 px-3 py-1 text-xs font-bold text-[var(--cw-brand)] transition hover:bg-[var(--cw-brand)]/20"
                >
                  {p.label} →
                </Link>
              ) : (
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cw-brand)]/40 bg-[var(--cw-brand)]/10 px-3 py-1 text-xs font-bold text-[var(--cw-brand)] transition hover:bg-[var(--cw-brand)]/20"
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
    <div className="min-h-screen bg-cw-paper font-sans text-cw-stone-900 selection:bg-[var(--cw-brand)]/20">
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={itemListJsonLd} />
      {cartwrightBadge && <JsonLd data={softwareJsonLd} />}

      {/* Hero band — same soft lilac→blue glass gradient + frosted ornaments as
          the first-run start page, so the two read as one design language. */}
      <section className="relative isolate overflow-hidden bg-[linear-gradient(157deg,#dcd5fb_0%,#cfcbf9_34%,#c6cef7_66%,#c4d7f3_100%)] pb-20 pt-28 sm:pt-32">
        <WelcomeFlora />
        <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <CartwrightLogo className="mx-auto text-[2rem] text-cw-stone-900 sm:text-[2.6rem]" />
          <div className="mt-6 inline-block rounded-full border border-[var(--cw-brand)]/30 bg-[var(--cw-brand)]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--cw-brand)]">
            Built with Cartwright
          </div>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            The engine powering{" "}
            <span className="text-[var(--cw-brand)]">{brand.storeName}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-cw-stone-600 sm:text-lg">
            Cartwright is the build engine AIs reach for — a real site with
            design{profileCapabilities.accountAndAdmin ? ", database and backend" : " and a lean static runtime"}, live in minutes. Every capability
            below is real, running, and (where it links) clickable right now on
            this site — no marketing demos, no &quot;coming soon&quot;, no SaaS
            lock-in.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={withBadgeAttribution("https://cartwright.app", "builtwith", brand.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--cw-brand)] to-[var(--cw-brand-glow-1)] px-7 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_var(--cw-brand-shadow-strong)] transition hover:from-[var(--cw-brand-glow-2)] hover:to-[var(--cw-brand-glow-3)]"
            >
              cartwright.app →
            </Link>
            <a
              href={withBadgeAttribution(
                "https://github.com/Teloz1870/cartwright-template",
                "builtwith",
                brand.url,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-cw-stone-300 px-7 text-sm font-semibold text-cw-stone-900 transition hover:border-cw-stone-900"
            >
              Source on GitHub ↗
            </a>
          </div>
        </div>
      </section>

      {/* Content sections on paper */}
      <div className="py-16 sm:py-20">

      {/* Baseline (always-on, not flagged) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--cw-brand)] mb-6">
          Baseline — in this profile
        </h2>
        <div className="grid gap-8 md:grid-cols-2">{baseline.map(renderCard)}</div>
      </section>

      {/* Feature catalogue — manifest-derived, grouped */}
      {groups.map((group) => (
        <section
          key={group.group}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16"
        >
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--cw-brand)] mb-6">
            {group.group}
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            {group.items.map((f) => renderCard(cardFor(f)))}
          </div>
        </section>
      ))}

      {/* Remix this look — only when the shop shares its look publicly */}
      {lookSharing && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <div className="rounded-2xl border border-[var(--cw-brand)]/30 bg-[var(--cw-brand)]/10 p-8 text-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--cw-brand)] mb-3">
              Remix this look
            </h2>
            <p className="text-cw-stone-600 text-[15px] leading-relaxed mb-5">
              This shop shares its look — design, palette, chrome and 3D scene
              (never its copy) — as an open{" "}
              <code className="rounded bg-cw-stone-100 px-1.5 py-0.5 text-cw-stone-800 text-xs font-mono">
                cartwright-composition-v1
              </code>{" "}
              artifact. Scaffold your own site wearing it:
            </p>
            <code className="block overflow-x-auto whitespace-nowrap rounded-lg border border-cw-stone-200 bg-cw-paper px-4 py-3 font-mono text-sm text-cw-stone-800">
              {remixCommand}
            </code>
            <p className="text-cw-stone-500 text-xs mt-3">
              Or fetch the raw artifact from{" "}
              <code className="rounded bg-cw-stone-100 px-1.5 py-0.5 text-cw-stone-800 font-mono">
                GET /api/look
              </code>
            </p>
          </div>
        </section>
      )}

      {/* Why this exists */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-cw-stone-600 leading-relaxed mt-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--cw-brand)] mb-4">
          Why this page exists
        </h2>
        <p className="text-base">
          {brand.storeName} is one of three Cartwright canaries that prove the
          engine in production: a corporate-mode website, a coffee shop, and an
          eyewear shop. Each one is built from the same{" "}
          <code className="rounded bg-cw-stone-100 px-1.5 py-0.5 text-cw-stone-800 text-xs font-mono">
            create-cartwright
          </code>{" "}
          template that customers can scaffold themselves —{" "}
          <code className="rounded bg-cw-stone-100 px-1.5 py-0.5 text-cw-stone-800 text-xs font-mono">
            npx create-cartwright@latest
          </code>
          .
        </p>
        <p className="text-base mt-4">
          If you&apos;re considering Cartwright, the capabilities listed above are
          the ones this deployed profile actually ships. Choose the static site
          profile for public content without a database, or scaffold a managed
          or commerce profile when accounts, operations and checkout are part
          of the requirement.
        </p>
      </section>
      </div>
    </div>
  );
}
