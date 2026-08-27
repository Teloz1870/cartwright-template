import { notFound } from "next/navigation";
import { getBrand } from "@/lib/brand";
import { getActiveDesign } from "@/lib/theme";
import WebMcpShowcase from "@/components/WebMcpShowcase";

export const dynamic = "force-dynamic";

/**
 * /<locale>/webmcp-check — the storefront's agent-tools page: the full WebMCP
 * inventory grouped by surface (built from the SAME binding consts the moat
 * test verifies, so the page cannot lie), the safety-moat explanation, setup
 * steps for Chrome / ChatGPT's built-in browser / the WebMCP Inspector, and
 * the live in-browser check. Gated behind brand.features.webMcp (404 when
 * off — the route answers as if it does not exist).
 *
 * The active design's own pack tools (DesignPack.webMcpToolBindings) resolve
 * server-side here so only tools that are REAL on this shop are listed.
 */
export default async function WebMcpCheckPage() {
  const brand = await getBrand();
  if (!brand.features.webMcp) notFound();

  const design = await getActiveDesign().catch(() => null);
  const packBindings = design?.webMcpToolBindings ?? {};

  return (
    <main className="mx-auto max-w-2xl p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
        {brand.storeName}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Agent tools on this storefront</h1>
      <p className="mt-2 text-sm leading-6 opacity-80">
        This shop speaks WebMCP: the pages register typed, page-contextual tools via{" "}
        <code>document.modelContext</code>, so an in-browser AI agent acts through a real
        API instead of guessing at the DOM — while the human keeps the checkout.
      </p>
      <WebMcpShowcase
        packBindings={packBindings}
        packName={design?.webMcpToolBindings ? (design?.name ?? design?.slug ?? null) : null}
      />
    </main>
  );
}
