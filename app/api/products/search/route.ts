import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { hybridRankProducts } from "@/lib/search/semantic";

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
      },
    });

    let products: typeof candidates;
    if (q) {
      const ranked = await hybridRankProducts(
        q,
        candidates.map((p) => ({
          id: p.id,
          haystack: `${p.name} ${p.brand ?? ""} ${p.description ?? ""}`.toLowerCase(),
        })),
        limit,
      );
      if (ranked) {
        const byId = new Map(candidates.map((p) => [p.id, p]));
        products = ranked
          .map((id) => byId.get(id))
          .filter((p): p is (typeof candidates)[number] => Boolean(p));
      } else {
        // Leksikalsk fallback (case-insensitiv — bredere end DB-contains, aldrig
        // smallere → ingen regression).
        const ql = q.toLowerCase();
        products = candidates
          .filter((p) =>
            `${p.name} ${p.description ?? ""} ${p.slug}`.toLowerCase().includes(ql),
          )
          .slice(0, limit);
      }
    } else {
      products = candidates.slice(0, limit);
    }

    const currency = brand.policies?.currency || "DKK";

    // Format the response for AI consumption (clean, structured data)
    const formattedProducts = products.map((p) => ({
      id: p.id,
      title: p.name,
      description: p.description,
      price: p.priceDkk,
      currency: currency,
      url: `${brand.url}/${brand.defaultLocale}/product/${p.slug}`,
      inStock: p.stock > 0,
      inventoryQuantity: p.stock,
      primaryImageUrl: resolveProductImageUrls(p)[0] ?? null,
      checkoutEndpoint: `${brand.url}/api/commerce/agent-checkout`,
    }));

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
