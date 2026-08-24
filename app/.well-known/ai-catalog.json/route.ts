import { getBrand } from "@/lib/brand";
import {
  mcpPublicDisabledResponse,
  mcpPublicOptionsResponse,
} from "@/lib/tools/public-gate";

// /.well-known/ai-catalog.json — a single JSON index of every agent-facing
// resource this store serves. Complements the RFC 9727 api-catalog (linkset)
// with a plain-JSON shape agents parse without linkset tooling. Only lists
// surfaces that exist in the running profile — honest discovery, as always.
export const dynamic = "force-dynamic";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

export async function GET(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse("/.well-known/ai-catalog.json");
  if (gated) return gated;

  const brand = await getBrand();
  const base = brand.url.replace(/\/+$/, "");
  // Every entry carries the same trust manifest: the store's real policy
  // surface (all four resolve — they are the canonical trust routes).
  const trustManifest = {
    privacy: `${base}/${brand.defaultLocale}/privacy`,
    terms: `${base}/${brand.defaultLocale}/info/terms`,
    contact: `${base}/${brand.defaultLocale}/contact`,
    about: `${base}/${brand.defaultLocale}/about`,
  };
  const resources = [
    { rel: "overview", href: `${base}/llms.txt`, type: "text/markdown", title: "Site overview for agents (llms.txt)" },
    { rel: "service-desc", href: `${base}/openapi.json`, type: "application/vnd.oai.openapi+json", title: "OpenAPI 3.1 contract for the tool API" },
    { rel: "service", href: `${base}/api/v1/tools`, type: "application/json", title: "REST tool invocation surface" },
    { rel: "mcp-server", href: `${base}/api/mcp`, type: "application/json", title: "MCP endpoint (Streamable HTTP)" },
    { rel: "auth", href: `${base}/auth.md`, type: "text/markdown", title: "API authentication guide" },
    { rel: "agent-skills", href: `${base}/.well-known/agent-skills/index.json`, type: "application/json", title: "Public Agent Skills index" },
    { rel: "sitemap", href: `${base}/sitemap.xml`, type: "application/xml", title: "Sitemap" },
    { rel: "service-doc", href: `${base}/${brand.defaultLocale}/developers`, type: "text/html", title: "Developer documentation" },
    ...(brand.ecommerceEnabled
      ? [{ rel: "pricing", href: `${base}/pricing.md`, type: "text/markdown", title: "Machine-readable pricing model" }]
      : []),
  ];

  return Response.json(
    {
      name: brand.storeName,
      description: brand.metadata.description,
      catalogVersion: "1",
      trustManifest,
      resources: resources.map((resource) => ({ ...resource, trustManifest })),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function OPTIONS(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse("/.well-known/ai-catalog.json");
  if (gated) return gated;
  return mcpPublicOptionsResponse(ALLOWED_METHODS);
}
