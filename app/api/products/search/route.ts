import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { resolveProductImageUrls } from "@/lib/media/shim";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/search
 * Agentic Commerce Endpoint. Allows AI agents (like Gemini, ChatGPT, or Claude)
 * to query the store's product catalogue programmatically.
 * 
 * Query params:
 * - q: Search string (e.g. "solbriller")
 * - limit: Number of results (default 10)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);

  try {
    const brand = await getBrand();
    
    // Find published products matching the query
    const products = await prisma.product.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { slug: { contains: q } },
        ],
      },
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        priceDkk: true,
        stock: true,
        images: true,
      },
    });

    const currency = brand.policies?.currency || "DKK";

    // Format the response for AI consumption (clean, structured data)
    const formattedProducts = products.map((p) => ({
      id: p.id,
      title: p.name,
      description: p.description,
      price: p.priceDkk,
      currency: currency,
      url: `${brand.url}/product/${p.slug}`,
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
