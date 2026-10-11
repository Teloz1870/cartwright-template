import { getBrand } from "@/lib/brand";
import { formatPrice } from "@/lib/format";
import { getCheckoutCurrency } from "@/lib/currency-server";
import PlpWebMcpTools, {
  type PlpToolCategory,
  type PlpToolFilters,
  type PlpToolProduct,
} from "@/components/webmcp/PlpWebMcpTools";

/**
 * Server-gate for the catalogue page's contextual WebMCP tools (the
 * PdpWebMcpMount pattern: the gate lives INSIDE the mount, the call site is
 * one unconditional line). `getBrand()` is request-cached and runtime-
 * resolved — `webMcp` is runtime-tier, so a merchant can flip it from
 * /admin/features without a deploy. Flag off ⇒ `null` ⇒ zero bytes in HTML —
 * canaries stay byte-identical.
 *
 * The narrowing hands the client leaf exactly what the HUMAN sees on this
 * render: the already-filtered product list (server-narrowed, capped) plus
 * the active filter state, so `list_visible_products` answers with zero
 * network and can never disagree with the page. Price strings are formatted
 * HERE (server) with the storefront's own `formatPrice` — in the BASE
 * currency the shop charges in, the same deliberate convention as
 * AgentMoney/`PdpWebMcpMount`.
 *
 * PROFILE NOTE: `components/webmcp/` is claimed by the WEBSHOP module and
 * KEPT by the CLI light profile — it compiles dormant because it only
 * imports core + webshop files.
 */

/** Bound so the tool result (and its descriptor) stays a sane size on big catalogues. */
const MAX_TOOL_PRODUCTS = 60;

type PlpMountProduct = {
  id: string;
  name: string;
  slug: string;
  priceDkk: number;
  stock: number;
  categoryId: string | null;
};

export default async function PlpWebMcpMount({
  products,
  categories,
  filters,
  locale,
}: {
  products: PlpMountProduct[];
  categories: { id: string; name: string; slug: string }[];
  filters: PlpToolFilters;
  locale: string;
}) {
  const brand = await getBrand();
  // The currency the customer is CHARGED in, not the shop's base. The note
  // above justified quoting base — true while multiCurrency is off, and false
  // the moment it is on: then the page's number IS the charge, and the agent's
  // was neither the charge nor the display.
  const chargeCurrency = await getCheckoutCurrency();
  if (!brand.ecommerceEnabled || !brand.features.webMcp) return null;

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const narrowed: PlpToolProduct[] = products.slice(0, MAX_TOOL_PRODUCTS).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    // The PAGE's locale, not the currency's. These tools quote the same
    // prices the shopper is reading, and `<Price>` now renders in the page's
    // language — so quoting the currency default here would put the agent
    // and the page it is standing on into two different languages, which is
    // the disagreement this contract exists to prevent.
    priceFormatted: formatPrice(p.priceDkk, { locale, currency: chargeCurrency }),
    inStock: p.stock > 0,
    category: (p.categoryId && categoryById.get(p.categoryId)) || null,
  }));

  const narrowedCategories: PlpToolCategory[] = categories.map((c) => ({
    slug: c.slug,
    name: c.name,
  }));

  return (
    <PlpWebMcpTools
      products={narrowed}
      totalCount={products.length}
      categories={narrowedCategories}
      filters={filters}
      locale={locale}
    />
  );
}
