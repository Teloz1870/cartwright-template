import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";
import { getSeoSettings } from "@/lib/seo-settings";

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
 *   - /account/* (login + ordrer — kunde-private)
 *   - /api/* (REST/MCP-endpoints — ikke indexerbar HTML)
 *   - /checkout (transactional flow — no SEO-value)
 *
 * Sitemap- og host-reference bruger getBrand(), så robots.txt afspejler det
 * runtime-domæne admin har sat i setup-wizarden — ikke compile-time-defaulten.
 */

// Dynamisk: robots.txt genereres pr. request, så getBrand()-domænet er friskt.
export const dynamic = "force-dynamic";

/**
 * AI-crawlere kategoriseret efter Search/Agent/Training-taksonomien
 * (Cloudflares model, juli 2026 — samme tredeling CDN-laget nu håndhæver):
 *  - SEARCH: indekserer til AI-søgning/answer-engines → citationer/trafik.
 *  - AGENT: handler på en KUNDES vegne (browsing, køb) → direkte omsætning.
 *  - TRAINING: høster til modeltræning → det, en ejer typisk vil blokere.
 */
const AI_SEARCH_CRAWLERS = [
  "OAI-SearchBot", // OpenAI search-indeks (ChatGPT search)
  "PerplexityBot", // Perplexity search-indeks
  "Claude-SearchBot", // Anthropic search-indeks
];
const AI_AGENT_CRAWLERS = [
  "ChatGPT-User", // ChatGPT browsing på bruger-forespørgsel
  "Perplexity-User", // Perplexity på bruger-forespørgsel
  "Claude-User", // Claude på bruger-forespørgsel
];
const AI_TRAINING_CRAWLERS = [
  "GPTBot", // OpenAI træning
  "Google-Extended", // Google Gemini / AI Overviews grounding+træning opt-out-token
  "ClaudeBot", // Anthropic træning
  "anthropic-ai", // Anthropic legacy
  "Applebot-Extended", // Apple Intelligence træning opt-out-token
];

/** Alle AI-crawlere + answer-engines vi eksplicit byder velkommen (GEO). */
const AI_CRAWLERS = [
  ...AI_SEARCH_CRAWLERS,
  ...AI_AGENT_CRAWLERS,
  ...AI_TRAINING_CRAWLERS,
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [{ url }, seo] = await Promise.all([getBrand(), getSeoSettings()]);
  // /konto/ holdt under transition så crawlers ikke spilder budget på 301'erne.
  // Kan fjernes efter ~6 mdr når Google har re-indekseret /account/.
  const disallow = ["/admin/", "/account/", "/konto/", "/api/", "/checkout"];

  // noindex: bed ALLE crawlere om at lade hele sitet være (staging/under-opbygning).
  if (seo.indexing === "noindex") {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      sitemap: `${url}/sitemap.xml`,
      host: url,
    };
  }

  // aiCrawlers=block: almindelige søgemaskiner må indeksere, men AI-bots afvises.
  if (seo.aiCrawlers === "block") {
    return {
      rules: [
        { userAgent: "*", allow: "/", disallow },
        { userAgent: AI_CRAWLERS, disallow: "/" },
      ],
      sitemap: `${url}/sitemap.xml`,
      host: url,
    };
  }

  // aiCrawlers=block-training: bloker KUN trænings-crawlere; AI-søgning og
  // agent-bots (kundernes indkøbsagenter) bydes stadig eksplicit velkommen.
  if (seo.aiCrawlers === "block-training") {
    return {
      rules: [
        { userAgent: "*", allow: "/", disallow },
        { userAgent: [...AI_SEARCH_CRAWLERS, ...AI_AGENT_CRAWLERS], allow: "/", disallow },
        { userAgent: AI_TRAINING_CRAWLERS, disallow: "/" },
      ],
      sitemap: `${url}/sitemap.xml`,
      host: url,
    };
  }

  // Default (public + allow): GEO — byd både søgemaskiner og AI-crawlere velkommen.
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: AI_CRAWLERS, allow: "/", disallow },
    ],
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
