import type { IndustryTemplate } from "../types";

/**
 * Phase 4 close-out: agent-marketplace template (pure A2A backend).
 *
 * The "Headless Merchant" archetype from Master Plan §3. No visual
 * storefront — buyer agents discover this shop via the signed Agent Card
 * at /api/agent-card, then negotiate via /api/negotiate (Anchor-and-Resume
 * deterministic engine, Phase 6) and pay via /api/escrow/verify with PoTE
 * proofs (Phase 8).
 *
 * "Products" here are agent capabilities — what the shop can sell as a
 * service to a buyer agent. The /admin dashboard (especially
 * /admin/agentic from Phase 9) is the only human-facing surface; visual
 * /[locale]/* pages are gated off via brand.features.webshop = false.
 *
 * Scaffolding a shop with --template agent-marketplace sets:
 *   brand.mode = "agent-marketplace"
 *   brand.features.a2a = true
 *   brand.features.acp = true
 *   brand.features.webshop = false
 *   brand.features.adminAgenticDashboard = true
 *
 * 3 stub capabilities. Replace with the actual services your shop's agent
 * offers.
 */
export const agentMarketplaceTemplate: IndustryTemplate = {
  label: "Agent Marketplace (A2A)",
  description:
    "Pure A2A-shop. No visual storefront. Buyer agents discover, negotiate, and pay via /api/agent-card + /api/negotiate + /api/escrow/verify. Human-in-the-loop via /admin/agentic.",
  categories: [
    {
      name: "Capabilities",
      slug: "capabilities",
      description:
        "What this shop's agent can sell. Each capability is a structured offer with floor/anchor pricing.",
    },
    {
      name: "Services",
      slug: "services",
      description:
        "Bundled or recurring services. Agents can negotiate quantity discounts via /api/negotiate.",
    },
  ],
  pages: [
    {
      slug: "about",
      title: "Agent Card",
      body: `## What is this?

This is an Agent Marketplace shop. There is no human-facing storefront — buyer agents reach this site via the Agent Card at /api/agent-card and transact via the A2A endpoints.

## How buyer agents interact

1. Discovery: \`GET /api/agent-card\` returns a signed JSON-LD blob describing capabilities, pricing, and trust anchors.
2. Negotiation: \`POST /api/negotiate\` invokes the deterministic Anchor-and-Resume engine and returns \`{decision, nextOffer, reasoningCodes}\`.
3. Payment: \`POST /api/escrow/verify\` releases funds once a Proof-of-Task-Execution (PoTE) is submitted.

## For the human owner

All A2A transactions, dispute queue, and policy editing live in /admin/agentic.`,
    },
  ],
  products: [
    {
      name: "Catalogue feed (per 1000 records)",
      slug: "catalogue-feed-1k",
      description:
        "Provides a structured product feed in ACP format. Per-thousand-record pricing with quantity-based concession via /api/negotiate.",
      priceDkk: 5900,
      images: [
        "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
      ],
      stock: 999999,
      categorySlug: "capabilities",
      featured: true,
    },
    {
      name: "Inventory check (single SKU)",
      slug: "inventory-check-sku",
      description:
        "Real-time stock check for a single SKU. Atomic call, sub-second response, no negotiation.",
      priceDkk: 100,
      images: [
        "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=800",
      ],
      stock: 999999,
      categorySlug: "capabilities",
      featured: true,
    },
    {
      name: "Bulk order fulfilment (per order)",
      slug: "bulk-order-fulfilment",
      description:
        "End-to-end fulfilment for a single bulk order: validation, payment via escrow, shipping, PoTE delivery confirmation. Negotiable per-unit pricing.",
      priceDkk: 99900,
      images: [
        "https://images.unsplash.com/photo-1553413077-190dd305871c?w=800",
      ],
      stock: 999999,
      categorySlug: "services",
      featured: true,
    },
  ],
};
