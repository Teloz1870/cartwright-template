import type { CatalogFeedItem } from "@/lib/feeds/catalog-feed";

/**
 * Google Merchant / Shopping RSS 2.0 serializer. Ren funktion (ingen prisma,
 * ingen env) så den kan unit-testes — /feed/google.xml-ruten henter katalog +
 * domæne og kalder denne. Genbruger det neutrale CatalogFeedItem (samme kilde
 * som ACP-feedet), så de to feeds aldrig divergerer.
 */

export type MerchantChannel = {
  title: string;
  link: string;
  description: string;
};

export type MerchantFeedOptions = {
  /**
   * Google UCP (marts 2026): markér produkter som native-buyable af agenter med
   * `g:native_commerce`. Sættes KUN når shoppen faktisk har agentic checkout
   * (ACP) — ellers ville feedet love noget den ikke kan honorere.
   */
  nativeCommerce?: boolean;
};

/** XML-escape — produkt-titler/beskrivelser kan indeholde &, <, >, ", '. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Bygger hele Merchant-feedet som RSS 2.0 + g:-namespace XML. */
export function buildGoogleMerchantXml(
  items: CatalogFeedItem[],
  channel: MerchantChannel,
  options: MerchantFeedOptions = {},
): string {
  const itemsXml = items
    .map((i) => {
      // priceMinor er øre/cents → major-enhed med 2 decimaler ("199.00 DKK").
      const price = `${(i.priceMinor / 100).toFixed(2)} ${i.currency}`;
      const parts = [
        `      <g:id>${escapeXml(i.id)}</g:id>`,
        `      <title>${escapeXml(i.title)}</title>`,
        `      <description>${escapeXml(i.description)}</description>`,
        `      <link>${escapeXml(i.url)}</link>`,
        i.imageUrl ? `      <g:image_link>${escapeXml(i.imageUrl)}</g:image_link>` : null,
        `      <g:availability>${i.availability}</g:availability>`,
        `      <g:price>${escapeXml(price)}</g:price>`,
        `      <g:condition>new</g:condition>`,
        i.brand ? `      <g:brand>${escapeXml(i.brand)}</g:brand>` : null,
        `      <g:product_type>${escapeXml(i.category)}</g:product_type>`,
        // Conversational attributes (Google AI Mode / Gemini shopping): produkt-
        // specs som name/value-par. Google matcher dem semantisk mod query-
        // fan-out. Kilde = Product.attributes (+ variant-akser) via CatalogFeedItem.
        ...(i.attributes
          ? Object.entries(i.attributes).map(
              ([name, value]) =>
                `      <g:product_detail>\n        <g:attribute_name>${escapeXml(name)}</g:attribute_name>\n        <g:attribute_value>${escapeXml(value)}</g:attribute_value>\n      </g:product_detail>`,
            )
          : []),
        // Google UCP native_commerce: signalér at produktet er native-buyable
        // af agenter. Kun når shoppen reelt har agentic checkout (ACP).
        options.nativeCommerce
          ? `      <g:native_commerce>enabled</g:native_commerce>`
          : null,
      ].filter(Boolean);
      return `    <item>\n${parts.join("\n")}\n    </item>`;
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(channel.title)}</title>\n` +
    `    <link>${escapeXml(channel.link)}</link>\n` +
    `    <description>${escapeXml(channel.description)}</description>\n` +
    `${itemsXml}\n` +
    `  </channel>\n` +
    `</rss>\n`
  );
}
