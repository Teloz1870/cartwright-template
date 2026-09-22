import type { CatalogFeedItem } from "@/lib/feeds/catalog-feed";

/**
 * OpenAI Agentic Commerce Protocol (ACP) product-feed serializer. Ren funktion
 * (ingen prisma, ingen env) så den unit-testes let — /api/acp/feed henter
 * katalog + brand og kalder denne. Genbruger det neutrale CatalogFeedItem
 * (samme kilde som Google Merchant-feedet), så de to feeds aldrig divergerer.
 *
 * Felt-navne/formater pinnet mod developers.openai.com/commerce/specs/feed:
 *   item_id, title, description, url, image_url, price ("<major> <ISO-4217>"),
 *   availability, store_country/target_countries (ISO 3166-1 alpha-2), seller_*
 *   + eligibility-flags.
 *
 * ACP Phase A = discovery: is_eligible_search: true, is_eligible_checkout: false
 * indtil Stripe Shared-Payment-Token-checkout (Phase B) er live. seller_privacy_
 * policy/seller_tos er kun PÅKRÆVET når is_eligible_checkout: true, men medtages
 * altid så feedet er klar til go-live.
 */

export type AcpSeller = {
  /** Butikkens visningsnavn (= JSON-LD Organization name). */
  name: string;
  /** Absolut butiks-URL (uden trailing slash). */
  url: string;
  /** Butikkens land, ISO 3166-1 alpha-2 (fx "DK"). */
  storeCountry: string;
  /** Lande feedet er gyldigt for. Default-kald sender [storeCountry]. */
  targetCountries: string[];
  /** Absolut privatlivspolitik-URL. */
  privacyPolicyUrl: string;
  /** Absolut handelsbetingelser-URL. */
  tosUrl: string;
  /** Må produkterne vises i agent-søgning (discovery)? Default true. */
  eligibleSearch?: boolean;
  /**
   * Må produkterne købes direkte af en agent? Kræver eligibleSearch + en live
   * Stripe SPT-checkout. Default false — Phase A publicerer kun discovery.
   */
  eligibleCheckout?: boolean;
};

/** Bygger ACP-produktfeedet som JSONL (én JSON-linje pr. købbar enhed). */
export function buildAcpFeed(
  items: CatalogFeedItem[],
  seller: AcpSeller,
): string {
  const sellerFields = {
    seller_name: seller.name,
    seller_url: seller.url,
    store_country: seller.storeCountry,
    target_countries: seller.targetCountries,
    seller_privacy_policy: seller.privacyPolicyUrl,
    seller_tos: seller.tosUrl,
    is_eligible_search: seller.eligibleSearch ?? true,
    is_eligible_checkout: seller.eligibleCheckout ?? false,
  };

  const body = items
    .map((i) =>
      JSON.stringify({
        item_id: i.id,
        title: i.title,
        description: i.description,
        url: i.url,
        // ACP price = major-enhed + ISO-4217, fx "129.00 DKK".
        price: `${(i.priceMinor / 100).toFixed(2)} ${i.currency}`,
        // catalog-feed giver "in_stock" | "out_of_stock" — begge er gyldige
        // ACP-enum-værdier (spec tillader også pre_order/backorder/unknown).
        availability: i.availability,
        ...(i.imageUrl ? { image_url: i.imageUrl } : {}),
        ...(i.brand ? { brand: i.brand } : {}),
        ...sellerFields,
      }),
    )
    .join("\n");

  // Trailing newline så hver linje (inkl. den sidste) er en komplet JSONL-record.
  return items.length ? `${body}\n` : "";
}
