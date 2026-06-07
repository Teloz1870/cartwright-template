import { getCatalogFeed } from "@/lib/feeds/catalog-feed";

/**
 * GET /api/acp/feed — produkt-feed i JSONL (én JSON-linje pr. købbar enhed).
 *
 * AI-shopping-agenter (fx ChatGPT Instant Checkout) henter et produkt-feed for
 * at kunne vise og anbefale shoppens varer. Dette er ACP Phase A: feedet
 * publiceres på en stabil URL — selve checkout'et bygges i Phase B, og
 * `enable_checkout` er derfor false indtil da.
 *
 * Bemærk: ACP/OpenAI's feed-skema er stadig under udvikling. Felt-navnene her
 * er rimelige og Google-Merchant-nære, men bør pinnes mod den officielle
 * ACP-feed-spec, før feedet registreres hos en agent-platform. Se
 * cartwright-acp-v0.2-spec.md (Part 4).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const items = await getCatalogFeed();
  const body = items
    .map((i) =>
      JSON.stringify({
        id: i.id,
        title: i.title,
        description: i.description,
        link: i.url,
        image_link: i.imageUrl,
        // Pris i mindste valuta-enhed (øre/cents) + ISO-4217 currency.
        price: { amount: i.priceMinor, currency: i.currency },
        availability: i.availability,
        brand: i.brand,
        product_category: i.category,
        // Flippes til true når ACP-checkout er bygget (Phase B).
        enable_checkout: false,
      }),
    )
    .join("\n");

  return new Response(items.length ? `${body}\n` : "", {
    headers: {
      "content-type": "application/jsonl; charset=utf-8",
      "cache-control": "public, max-age=900, s-maxage=900",
    },
  });
}
