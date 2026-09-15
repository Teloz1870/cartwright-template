import { getBrand } from "@/lib/brand";
import CartWebMcpTools, { type CartToolItem } from "@/components/webmcp/CartWebMcpTools";

/**
 * Server-gate for kurvsidens kontekstuelle WebMCP-tools (samme mønster som
 * PdpWebMcpMount — gaten bor i mountet, kaldsstederne er én linje i HVER af
 * kurvsidens to ikke-tomme render-grene). Flag off ⇒ null ⇒ byte-identisk.
 *
 * Item-listen narrowes her så klient-leafet får præcis de håndtag
 * tool-beskrivelsen skal bruge — friskhed følger RSC-flowet: en mutation
 * revalidater /cart, Next re-renderer siden, mountet får de nye linjer, og
 * leafets effect-dep re-registrerer tools med den nye liste.
 */

type CartMountItem = {
  id: string;
  quantity: number;
  product: { name: string; stock: number };
  variant: { stock: number } | null;
};

export default async function CartWebMcpMount({ items }: { items: CartMountItem[] }) {
  const brand = await getBrand();
  if (!brand.ecommerceEnabled || !brand.features.webMcp) return null;

  const narrowed: CartToolItem[] = items.map((i) => ({
    cartItemId: i.id,
    productName: i.product.name,
    quantity: i.quantity,
    maxQuantity: i.variant?.stock ?? i.product.stock,
  }));

  return <CartWebMcpTools items={narrowed} />;
}
