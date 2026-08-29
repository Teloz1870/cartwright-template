import { getBrand } from "@/lib/brand";
import { formatPrice } from "@/lib/format";
import { getCheckoutCurrency } from "@/lib/currency-server";
import PdpWebMcpTools, { type PdpToolProduct } from "@/components/webmcp/PdpWebMcpTools";

/**
 * Server-gate for PDP'ens kontekstuelle WebMCP-tool (VoiceShopMount-mønstret:
 * gaten bor INDE i mountet, kaldsstedet er én betingelsesløs linje i
 * `pdpTree`). `getBrand()` er request-cachet og runtime-opløst — `webMcp` er
 * runtime-tier, så en merchant kan tænde den fra /admin/features uden deploy.
 * Flag off ⇒ `null` ⇒ nul bytes i HTML — canaries er byte-identiske.
 *
 * Prisstrenge formateres HER (server) med samme `formatPrice`-sti som
 * storefronten — i BASE-valutaen, dvs. den valuta shoppen OPKRÆVER i (samme
 * bevidste valg som AgentMoney i lib/format.ts). En shopper der har skiftet
 * visningsvaluta (currencySwitcher, default-off) ser konverterede tal i
 * UI'en mens toolet citerer opkrævningsbeløbet — det er dokumenteret
 * adfærd, ikke en glemt konvertering; klient-leafet skal ikke trække
 * money/FX-kæden ind i bundtet for en visningskonvention.
 *
 * PROFIL-NOTE: `components/webmcp/` er claimet af WEBSHOP-modulet (mounts er
 * kurv/PDP-flader) og BEHOLDES af CLI'ens light-profil (jf. docblocken over
 * LIGHT_EXCLUDED_PATHS i cartwright-app) — den kompilerer i dvale, fordi den
 * kun importerer core + webshop-filer.
 */

type PdpMountProduct = {
  id: string;
  name: string;
  slug: string;
  priceDkk: number;
  stock: number;
  variants: {
    id: string;
    sku: string;
    priceDkk: number;
    stock: number;
    attributes: Record<string, string>;
  }[];
};

export default async function PdpWebMcpMount({
  product,
  // The PAGE's locale, taken as a prop — the same shape PlpWebMcpMount uses,
  // and the reason is not just symmetry: reading it via next-intl/server here
  // makes the component untestable outside a server bundle, and this mount has
  // exactly one call site (the PDP), which already has the locale in scope.
  locale,
}: {
  product: PdpMountProduct;
  locale: string;
}) {
  const brand = await getBrand();
  // The currency the customer is CHARGED in, not the shop's base. The note
  // above justified quoting base — true while multiCurrency is off, and false
  // the moment it is on: then the page's number IS the charge, and the agent's
  // was neither the charge nor the display.
  const chargeCurrency = await getCheckoutCurrency();
  if (!brand.ecommerceEnabled || !brand.features.webMcp) return null;

  const hasVariants = product.variants.length > 0;
  const inStock = hasVariants
    ? product.variants.some((v) => v.stock > 0)
    : product.stock > 0;

  const narrowed: PdpToolProduct = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    inStock,
    priceFormatted: hasVariants
      ? `from ${formatPrice(Math.min(...product.variants.map((v) => v.priceDkk)), { locale, currency: chargeCurrency })}`
      : formatPrice(product.priceDkk, { locale, currency: chargeCurrency }),
    variants: product.variants.map((v) => {
      // Natural-language option name (Chrome best practices: values a human
      // would recognise — "Whole beans, 250 g", never an internal id). The
      // attribute VALUES are the human words; keys and sku are plumbing.
      // Duplicate labels are disambiguated by price downstream.
      const attrs = Object.values(v.attributes).join(", ");
      return {
        id: v.id,
        label: attrs || v.sku,
        priceFormatted: formatPrice(v.priceDkk, { locale, currency: chargeCurrency }),
        stock: v.stock,
      };
    }),
  };

  return <PdpWebMcpTools product={narrowed} />;
}
