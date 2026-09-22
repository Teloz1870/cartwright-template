import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { hybridRankProducts } from "@/lib/search/semantic";
import { matchesAllTokens, productHaystack } from "@/lib/search/lexical";
import { PACK_SIZE_ATTRIBUTE } from "@/lib/product-attributes";
import { getCheckoutCurrency } from "@/lib/currency-server";
import { resolveRequestLocale } from "@/lib/request-locale";
import { agentMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/search
 * Agentic Commerce Endpoint. Allows AI agents (like Gemini, ChatGPT, or Claude)
 * to query the store's product catalogue programmatically.
 *
 * Søgning er hybrid: semantisk (vektor-cosine) ranking når kataloget er
 * embeddet, ellers blød fallback til leksikalsk `contains`. Se lib/search/.
 *
 * Query params:
 * - q: Search string (e.g. "solbriller")
 * - limit: Number of results (default 10)
 */
/**
 * Grams per pack, read from the shop's own attribute vocabulary.
 *
 * The coffee template records it as `weightG` (industry-templates/coffee),
 * which is the crema pack's documented key. Anything non-numeric or
 * non-positive yields null — a recommendation that says "pack size unknown" is
 * honest; one that invents 250 is not.
 */
function packSizeOf(attributes: unknown): number | null {
  if (!attributes || typeof attributes !== "object") return null;
  const raw = (attributes as Record<string, unknown>)[PACK_SIZE_ATTRIBUTE];
  const grams = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  // Agent-venlig limit-parsing: ikke-numerisk → default 10 i stedet for at
  // NaN når Prisma (`take: NaN` kastede → 500). Clamp 1..50.
  const limitRaw = parseInt(searchParams.get("limit") || "10", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

  try {
    const brand = await getBrand();

    // Med fritekst hentes hele det publicerede katalog som kandidat-sæt
    // (cosine laves i TS — OK for det dokumenterede <10k-loft). UDEN fritekst
    // begrænser vi i DB med `take` så vi ikke loader unødigt.
    const candidates = await prisma.product.findMany({
      where: { deletedAt: null },
      ...(q ? {} : { take: limit }),
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        brand: true,
        priceDkk: true,
        stock: true,
        images: true,
        // Selected so the shop's structured vocabulary is searchable: the
        // coffee seed records `process: "Washed"`, and before this a search
        // for "washed" could not find the product that IS washed.
        attributes: true,
      },
    });

    let products: typeof candidates;
    if (q) {
      const ranked = await hybridRankProducts(
        q,
        candidates.map((p) => ({
          id: p.id,
          // Attributes belong here too. They are searchable in the lexical
          // fallback below (productHaystack reads them), so leaving them out
          // here made "which fields are searchable" depend on whether the
          // catalogue happened to be embedded — two answers to one question.
          haystack: productHaystack(p),
        })),
        limit,
      );
      if (ranked) {
        const byId = new Map(candidates.map((p) => [p.id, p]));
        products = ranked
          .map((id) => byId.get(id))
          .filter((p): p is (typeof candidates)[number] => Boolean(p));
      } else {
        // Leksikalsk fallback. Was `.includes(query)` — a verbatim CONTIGUOUS
        // substring test of the whole query, which made search
        // punctuation-exact: live, "bright, floral single-origin" found the
        // product and "bright floral" found nothing, because only the comma
        // was missing. Normalised AND-over-tokens now, shared with every other
        // search entry point so a query cannot mean different things depending
        // on which door it came through.
        products = candidates
          .filter((p) => matchesAllTokens(productHaystack(p), q))
          .slice(0, limit);
      }
    } else {
      products = candidates.slice(0, limit);
    }

    // The currency the customer would be CHARGED in, not the shop's base.
    // The two are the same until multiCurrency is on; after that, quoting base
    // here would put the agent in a different currency than the page it is
    // reading — the same class of disagreement the locale fix closed.
    const currency = await getCheckoutCurrency();

    // The URL follows the CALLER's locale, not a store-wide default.
    //
    // Measured live: an agent on https://demo.cartwright.app/en asked for
    // "ethiopia" and got back /da/product/ethiopia-yirgacheffe — a Danish link
    // from an English page, which then pulled the whole conversation into
    // Danish. The cause is that `getBrand().defaultLocale` reads the
    // BrandingSettings row, which on that shop still says "da", while the
    // router redirects / to /en from compile-time config. Two resolvers, one
    // stale row, and the agent surface believed the wrong one.
    //
    // Rather than pick a winner between those two — the operator can genuinely
    // change the default via the admin, which writes Redis for the proxy to
    // read — the answer here is simply not to guess: the request says which
    // locale it is on. `?locale=` is honoured when it is a locale this shop
    // serves; otherwise the Referer's first path segment; otherwise the
    // store-wide default as before.
    const locale = resolveRequestLocale(request, brand.defaultLocale);

    // Format the response for AI consumption (clean, structured data)
    const formattedProducts = products.map((p) => {
      const unitPrice = agentMoney(p.priceDkk, locale, currency);
      return {
      id: p.id,
      title: p.name,
      description: p.description,
      // `price` and `currency` are one amount. The old compatibility field
      // kept base minor units while relabelling them as the selected charge
      // currency (14900 USD for a 149 DKK bag). Keep the base ledger value in
      // explicitly named fields instead of publishing contradictory money.
      price: unitPrice.amountMinor,
      currency: unitPrice.currency,
      basePriceMinor: p.priceDkk,
      baseCurrency: brand.policies.currency,
      // The REQUEST's locale, not the currency's. This response already had
      // its URLs localised; leaving the money behind meant an English agent
      // read "/en/product/…" beside "149,00 kr.".
      unitPrice: unitPrice,
      // The pack size, lifted out of the free-form attributes bag into a named
      // field. Without this the brew recommendation could never report "one
      // 250 g bag, 132 g left over" against the real catalogue — it read a
      // `packSizeGrams` the route did not send, so every live answer degraded
      // to "pack size unknown". A unit test hid it by supplying the field the
      // route omits; the live response is what proved it.
      packSizeGrams: packSizeOf(p.attributes),
      url: `${brand.url}/${locale}/product/${p.slug}`,
      // The slug as its own field. Consumers used to recover it by splitting
      // `url` on "/product/" — so changing the route segment (this repo does
      // localise `/produkter`) would have left every consumer with an empty
      // slug and no test failing, because the FIELD NAMES were all still
      // there. A value nobody has to reverse-engineer cannot drift.
      slug: p.slug,
      inStock: p.stock > 0,
      inventoryQuantity: p.stock,
      primaryImageUrl: resolveProductImageUrls(p)[0] ?? null,
      checkoutEndpoint: `${brand.url}/api/commerce/agent-checkout`,
      };
    });

    return NextResponse.json({
      query: q,
      resultsCount: formattedProducts.length,
      products: formattedProducts,
    });
  } catch (error) {
    console.error("Agent search API error:", error);
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 });
  }
}
