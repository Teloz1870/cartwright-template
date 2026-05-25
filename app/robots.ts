import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";

/**
 * Robots.txt for søgemaskine- og AI-crawlere.
 *
 * Allow: alle public storefront-routes — for både klassiske søgemaskiner og
 * AI-crawlere/answer-engines. AI-crawlerne listes EKSPLICIT som et bevidst
 * GEO-signal (Generative Engine Optimization): shoppen vil gerne indekseres
 * og citeres af AI-assistenter. Den eksplicitte regel overlever også, hvis
 * `*`-reglen senere strammes.
 *
 * Disallow:
 *   - /admin/* (admin-UI — kun for shop-ejer)
 *   - /konto/* (login + ordrer — kunde-private)
 *   - /api/* (REST/MCP-endpoints — ikke indexerbar HTML)
 *   - /checkout (transactional flow — no SEO-value)
 *
 * Sitemap- og host-reference bruger getBrand(), så robots.txt afspejler det
 * runtime-domæne admin har sat i setup-wizarden — ikke compile-time-defaulten.
 */

// Dynamisk: robots.txt genereres pr. request, så getBrand()-domænet er friskt.
export const dynamic = "force-dynamic";

/** AI-crawlere + answer-engines vi eksplicit byder velkommen (GEO). */
const AI_CRAWLERS = [
  "GPTBot", // OpenAI
  "OAI-SearchBot", // OpenAI search
  "ChatGPT-User", // ChatGPT browsing på bruger-forespørgsel
  "PerplexityBot", // Perplexity
  "Perplexity-User",
  "Google-Extended", // Google Gemini / AI Overviews
  "ClaudeBot", // Anthropic
  "anthropic-ai",
  "Applebot-Extended", // Apple Intelligence
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { url } = await getBrand();
  const disallow = ["/admin/", "/konto/", "/api/", "/checkout"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: AI_CRAWLERS, allow: "/", disallow },
    ],
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
