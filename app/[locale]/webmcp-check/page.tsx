import { notFound } from "next/navigation";
import { getBrand } from "@/lib/brand";
import WebMcpCheck from "@/components/WebMcpCheck";

export const dynamic = "force-dynamic";

/**
 * /<locale>/webmcp-check — lille verifikations-side for WebMCP-eksperimentet.
 * Gated bag brand.features.webMcp (404 når off). Viser om browseren understøtter
 * WebMCP og hvilke storefront-tools der er registreret (af WebMcpRegistrar).
 */
export default async function WebMcpCheckPage() {
  const brand = await getBrand();
  if (!brand.features.webMcp) notFound();

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">WebMCP check</h1>
      <p className="mt-2 text-sm opacity-80">
        Experimental in-browser agent tools for {brand.storeName}. Open this page in a
        Chromium browser with WebMCP enabled to confirm the storefront tools register.
      </p>
      <WebMcpCheck />
    </main>
  );
}
