import { getCatalogFeed } from "@/lib/feeds/catalog-feed";
import { getBrand } from "@/lib/brand";
import { buildAcpFeed } from "@/lib/feeds/acp-feed";
import { allowResponse } from "@/lib/http/allow";

/**
 * GET /api/acp/feed — OpenAI Agentic Commerce Protocol product feed (JSONL,
 * én JSON-linje pr. købbar enhed).
 *
 * AI-shopping-agenter (fx ChatGPT search) henter feedet for at kunne vise og
 * anbefale shoppens varer. ACP Phase A = discovery: `is_eligible_search` er
 * true, `is_eligible_checkout` er false indtil Stripe Shared-Payment-Token-
 * checkout (Phase B) er live. Felt-skemaet er pinnet mod den officielle spec
 * (developers.openai.com/commerce/specs/feed) via lib/feeds/acp-feed.ts.
 */
export const dynamic = "force-dynamic";

/** `GET` is the only verb with a body; `HEAD` is Next's, filled in from it. */
const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

/**
 * The reply both verbs give when the gate is shut — one expression, so a later
 * edit cannot make `OPTIONS` distinguishable from `GET` again.
 */
function gatedNotFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function GET(): Promise<Response> {
  const brand = await getBrand();
  // Feedet giver kun mening for shops med produkter — samme website-mode-
  // paritet som /feed/google.xml (dér: ecommerceEnabled && merchantFeed).
  // Ingen ekstra flag-konjunkt her: feedet ER discovery-overfladen for enhver
  // webshop (Phase A), mens checkout-ruterne separat gates af features.acp.
  if (!brand.ecommerceEnabled) {
    return gatedNotFound();
  }

  const items = await getCatalogFeed();
  const base = brand.url.replace(/\/+$/, "");
  const storeCountry = brand.policies.country; // ISO 3166-1 alpha-2, fx "DK"

  const jsonl = buildAcpFeed(items, {
    name: brand.storeName,
    url: base,
    storeCountry,
    targetCountries: [storeCountry],
    privacyPolicyUrl: `${base}/${brand.defaultLocale}/privacy`,
    tosUrl: `${base}/${brand.defaultLocale}/info/terms`,
    // Phase A publicerer kun discovery; flip eligibleCheckout når SPT-checkout
    // er live (og seller_privacy_policy/seller_tos dermed bliver påkrævet).
    eligibleSearch: true,
    eligibleCheckout: false,
  });

  return new Response(jsonl, {
    headers: {
      "content-type": "application/jsonl; charset=utf-8",
      "cache-control": "public, max-age=900, s-maxage=900",
    },
  });
}

/**
 * Same gate as `GET`. Note this one is NOT flag-gated: `ecommerceEnabled` is
 * the whole condition, so the feed keeps answering on any webshop and only
 * disappears on a website-mode site — which is exactly where the framework's
 * substitute used to advertise it.
 */
export async function OPTIONS(): Promise<Response> {
  const brand = await getBrand();
  if (!brand.ecommerceEnabled) {
    return gatedNotFound();
  }
  return allowResponse(ALLOWED_METHODS);
}
