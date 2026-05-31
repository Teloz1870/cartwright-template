/**
 * /built-with-cartwright — the "what powers this shop" tour.
 *
 * Ships with every Cartwright scaffold. Lists the engine's headline
 * capabilities (28 admin routes, MCP/ACP/A2A APIs, modern web baseline,
 * voice shopping, JSON-LD, magic-link auth, Stripe test/live toggle).
 * Each card links to a live surface so visitors can click through and
 * see the feature in action.
 *
 * Three audiences:
 *   1. Prospective customers visiting one of Cartwright's canary demos
 *      (teloz-showcase, demo.cartwright.app, solbrillen.dk) — see what
 *      they'd get by building on the engine.
 *   2. Customers running their own shop on Cartwright — proud "tech
 *      stack tour" surface they can keep, customise, or link to.
 *   3. AI crawlers (Google AI Overviews, Perplexity, ChatGPT browse) —
 *      JSON-LD WebSite + ItemList structured data makes the engine's
 *      contents legible without executing JS.
 *
 * CUSTOMERS: Delete this file (`app/[locale]/built-with-cartwright/`)
 * if your shop doesn't want a Cartwright tour visible. The cartwright
 * badge in the Footer (controlled by `brand.features.cartwrightBadge`)
 * stops linking to a 404 — set the flag to `false` to hide it entirely.
 *
 * No `ecommerceEnabled` gate — this page works for website-mode,
 * webshop-mode, AND agent-marketplace-mode. The shop's own brand
 * identity (storeName, tagline) is read from brand.config so the page
 * reads as "Built with Cartwright — powering {your-shop}".
 */
import Link from "next/link";
import type { Metadata } from "next";
import { brand } from "@/brand.config";
import JsonLd from "@/components/JsonLd";

export const metadata: Metadata = {
  title: `Built with Cartwright | ${brand.storeName}`,
  description: `The engine powering ${brand.storeName}: MCP server, Agentic Commerce Protocol, modern web baseline, magic-link auth, Stripe test/live toggle, JSON-LD structured data, and 28+ admin routes — open-source, scaffoldable, owned by you.`,
};

const CAPABILITIES = [
  {
    title: "Cartwright Live Canvas — AI-Configurable 3D",
    blurb:
      "A performance-first Three.js hero that ships with the engine: four built-in WebGL scenes (floating geometry, particle field, morphing blob, wireframe terrain), auto-tinted from your theme palette, lazy-loaded after paint so Core Web Vitals never regress. Reduced-motion, save-data, and no-WebGL all fall back to a clean gradient. The twist: configure it with words — the AI sets your scene + intensity via the `three.configure` tool. No other template ships this.",
    proof: [
      { label: "Configure it (admin)", href: "/admin/three-d" },
      { label: "See the engine", href: "https://github.com/Teloz1870/cartwright-template" },
    ],
  },
  {
    title: "AI-Native by Default",
    blurb:
      "MCP server with a tool registry, Anthropic + Gemini wired in on day one. External agents can discover and invoke shop operations natively — no integration tax, no bolted-on AI layer.",
    proof: [
      { label: "Live MCP endpoint", href: "/api/mcp" },
      { label: "Public tool catalog", href: "/api/v1/tools" },
    ],
  },
  {
    title: "Agentic Commerce Protocol (ACP)",
    blurb:
      "External buying agents (ChatGPT, Claude, Perplexity, future agentic shoppers) can browse the product feed, create checkout sessions, settle via escrow. First-class agent customers — same auth path as humans.",
    proof: [
      { label: "ACP product feed", href: "/api/acp/feed" },
      {
        label: "ACP checkout endpoint",
        href: "/api/acp/v1/checkout_sessions",
      },
    ],
  },
  {
    title: "Modern Web Baseline (v0.8)",
    blurb:
      "Native <dialog> for modals + drawers, View Transitions for page navigation, container queries on responsive components, aria-live announcements for cart/review events, lazy-loaded images. The baseline is browser-native — not JS-library polyfill.",
    proof: [
      { label: "Read the baseline contract", href: "https://github.com/Teloz1870/cartwright-template" },
    ],
  },
  {
    title: "Schema.org / JSON-LD Everywhere",
    blurb:
      "Organization on the root layout, Product + Offer on every PDP, BreadcrumbList on PLP + PDP, AggregateRating on review-enabled pages, FAQPage on category pages. AI search engines see structured data without executing JS.",
    proof: [],
  },
  {
    title: "Full Admin (28 routes)",
    blurb:
      "Products, orders, customers, reviews, content pages, AI prompts per template, Stripe test/live toggle, audit log of every action, agentic dashboard for ACP/A2A transactions, voice-shop settings, design token playground, setup wizard.",
    proof: [
      { label: "Open the admin", href: "/admin" },
    ],
  },
  {
    title: "Magic-Link Auth",
    blurb:
      "Passwordless login via NextAuth + Resend. No third-party identity vendor lock-in, no SSO contract, no password resets. Email magic-link works for customers and admin equally. Passkeys scaffolded for upgrade when WebAuthn ceremony lands.",
    proof: [
      { label: "Try logging in", href: "/account/login" },
    ],
  },
  {
    title: "Voice Shopping (Gemini Live)",
    blurb:
      "Opt-in mic FAB that streams to Gemini Live. Customer speaks intent, transcription becomes chat, AI assistant fulfills (search products, add to cart, complete order). Compile-time gated by `brand.features.voiceShop` so shops without Gemini budget don't ship a button that errors.",
    proof: [],
  },
];

export default function BuiltWithCartwrightPage() {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: `${brand.storeName} — Built with Cartwright`,
    url: `${brand.url}/built-with-cartwright`,
    description: `The Cartwright engine powering ${brand.storeName}.`,
    publisher: {
      "@type": "Organization",
      name: brand.storeName,
      url: brand.url,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: brand.storeName,
        item: brand.url,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Built with Cartwright",
        item: `${brand.url}/built-with-cartwright`,
      },
    ],
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Cartwright engine capabilities",
    itemListElement: CAPABILITIES.map((cap, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: cap.title,
      description: cap.blurb,
    })),
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30 selection:text-white pt-32 pb-24">
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={itemListJsonLd} />

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
          below is real, running, and clickable right now on this site —
          no marketing demos, no "coming soon", no SaaS lock-in.
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

      {/* Capabilities grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-24">
        <div className="grid gap-8 md:grid-cols-2">
          {CAPABILITIES.map((cap) => (
            <article
              key={cap.title}
              className="rounded-2xl border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl p-8 hover:border-white/20 transition-colors"
            >
              <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
                {cap.title}
              </h2>
              <p className="text-white/70 leading-relaxed mb-6 text-[15px]">
                {cap.blurb}
              </p>
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
          ))}
        </div>
      </section>

      {/* Why this exists */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white/60 leading-relaxed">
        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-300 mb-4">
          Why this page exists
        </h2>
        <p className="text-base">
          {brand.storeName} is one of three Cartwright canaries that prove the
          engine in production: a corporate-mode website, a coffee shop, and
          an eyewear shop. Each one is built from the same{" "}
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
          If you're considering Cartwright for your own shop, what you're
          looking at right now is what you'd get on day one. Not a demo on
          screenshots — the actual code, deployed to production, doing real
          orders (test-mode here, real-mode on your fork).
        </p>
      </section>
    </div>
  );
}
