import { brand as brandConfig } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { getCatalogFeed } from "@/lib/feeds/catalog-feed";
import { buildGoogleMerchantXml } from "@/lib/feeds/google-merchant";
import { allowResponse } from "@/lib/http/allow";

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
  const merged = await getBrand();
  // Feedet giver kun mening for shops med produkter; følg samme gate som
  // resten af webshop-fladen + det runtime-toggleable flag.
  if (!merged.ecommerceEnabled || !merged.features.merchantFeed) {
    return gatedNotFound();
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

/**
 * Same gate as `GET` — both conjuncts, not just the flag. Without this export
 * the framework answered `OPTIONS` itself, so a website-mode site (no
 * `ecommerceEnabled`) or a webshop with `merchantFeed` off still advertised a
 * product feed it answers `404` for.
 */
export async function OPTIONS(): Promise<Response> {
  const merged = await getBrand();
  if (!merged.ecommerceEnabled || !merged.features.merchantFeed) {
    return gatedNotFound();
  }
  return allowResponse(ALLOWED_METHODS);
}
