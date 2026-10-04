import { getBrand } from "@/lib/brand";
import BrewWebMcpTools from "./BrewWebMcpTools";

/**
 * Server-gate for the pack's brew-ratio WebMCP tool (the PdpWebMcpMount
 * pattern: gate INSIDE the mount, one unconditional line at the call site —
 * here the crema homepage, which makes "crema is the active design"
 * implicit). Flag off ⇒ null ⇒ zero bytes in HTML — byte-identity holds.
 */
export default async function BrewWebMcpMount() {
  const brand = await getBrand();
  if (!brand.ecommerceEnabled || !brand.features.webMcp) return null;
  return <BrewWebMcpTools />;
}
