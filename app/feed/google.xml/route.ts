import { brand as brandConfig } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { getCatalogFeed } from "@/lib/feeds/catalog-feed";
import { buildGoogleMerchantXml } from "@/lib/feeds/google-merchant";

/**
 * GET /feed/google.xml — Google Merchant Center produkt-feed (RSS 2.0 +
 * g:-namespace). Genbruger det neutrale getCatalogFeed() (samme kilde som
 * ACP-feedet i /api/acp/feed) — ét katalog, to serializers. XML-bygning lever
 * i lib/feeds/google-merchant.ts (ren + unit-testet).
 *
 * Gated på brand.features.merchantFeed (runtime-toggleable i /admin/features).
 * Off → 404, så shops der ikke bruger Merchant Center ikke eksponerer et feed.
 * Selve Merchant Center-kontoen + feed-registreringen er operatør-side; engine'en
 * producerer kun XML'en.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const merged = await getBrand();
  // Feedet giver kun mening for shops med produkter; følg samme gate som
  // resten af webshop-fladen + det runtime-toggleable flag.
  if (!merged.ecommerceEnabled || !merged.features.merchantFeed) {
    return new Response("Not found", { status: 404 });
  }

  const items = await getCatalogFeed();
  const body = buildGoogleMerchantXml(
    items,
    {
      title: brandConfig.storeName,
      link: merged.url.replace(/\/+$/, ""),
      description: brandConfig.metadata.description,
    },
    // native_commerce annonceres kun når shoppen faktisk har agentic checkout.
    { nativeCommerce: Boolean(merged.features.acp) },
  );

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=900, s-maxage=900",
    },
  });
}
