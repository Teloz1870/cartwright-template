import { getBrand } from "@/lib/brand";
import {
  mcpPublicDisabledResponse,
  mcpPublicOptionsResponse,
} from "@/lib/tools/public-gate";

// /.well-known/ai-catalog.json — the store's ARD manifest (Agentic Resource
// Discovery, agenticresourcediscovery.org shape as consumed by ai-catalog.io):
// `specVersion` + `host` + an `entries` array where every entry carries a
// domain-anchored `urn:air:` identifier, an IANA media type, exactly one of
// `url`|`data`, and a trust manifest whose `identity` aligns with the
// publisher domain. Complements the RFC 9727 api-catalog (linkset) with a
// plain-JSON shape agents parse without linkset tooling. Only lists surfaces
// that exist in the running profile — honest discovery, as always.
export const dynamic = "force-dynamic";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

export async function GET(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse("/.well-known/ai-catalog.json");
  if (gated) return gated;

  const brand = await getBrand();
  const base = brand.url.replace(/\/+$/, "");
  // Host derivation must not 500 a discovery surface: setup accepts loose
  // domain strings (e.g. a bare "https://"), so fall back to a manual strip
  // when URL parsing rejects the configured value.
  let host: string;
  try {
    host = new URL(base).host;
  } catch {
    host = "";
  }
  if (!host) {
    host =
      base.replace(/^[a-z+]+:\/\//i, "").replace(/[/:?#].*$/, "") ||
      "unconfigured.invalid";
  }
  // Every entry carries the same trust manifest: ARD requires `identity` to
  // align with the publisher domain in the entry identifier; the rest is the
  // store's real policy surface (all four resolve — they are the canonical
  // trust routes).
  const trustManifest = {
    identity: `did:web:${host}`,
    privacy: `${base}/${brand.defaultLocale}/privacy`,
    terms: `${base}/${brand.defaultLocale}/info/terms`,
    contact: `${base}/${brand.defaultLocale}/contact`,
    about: `${base}/${brand.defaultLocale}/about`,
  };
  const urn = (namespace: string, name: string) =>
    `urn:air:${host}:${namespace}:${name}`;
  const features = brand.features as { webMcp?: boolean };
  const entries = [
    {
      identifier: urn("doc", "llms-overview"),
      displayName: "Site overview for agents (llms.txt)",
      type: "text/markdown",
      url: `${base}/llms.txt`,
      representativeQueries: [
        `what does ${brand.storeName} offer`,
        "how can an AI agent use this site",
      ],
    },
    {
      identifier: urn("api", "openapi"),
      displayName: "OpenAPI 3.1 contract for the tool API",
      type: "application/vnd.oai.openapi+json",
      url: `${base}/openapi.json`,
    },
    {
      identifier: urn("api", "tools"),
      displayName: "REST tool invocation surface",
      type: "application/json",
      url: `${base}/api/v1/tools`,
      representativeQueries: [
        "list the tools this site exposes",
        "call a site tool over REST",
      ],
    },
    {
      identifier: urn("mcp", "server"),
      displayName: "MCP server card (Streamable HTTP endpoint)",
      type: "application/mcp-server-card+json",
      url: `${base}/.well-known/mcp/server-card.json`,
    },
    {
      identifier: urn("doc", "auth"),
      displayName: "API authentication guide",
      type: "text/markdown",
      url: `${base}/auth.md`,
    },
    {
      identifier: urn("doc", "agent-skills"),
      displayName: "Public Agent Skills index",
      type: "application/json",
      url: `${base}/.well-known/agent-skills/index.json`,
    },
    {
      identifier: urn("doc", "sitemap"),
      displayName: "Sitemap",
      type: "application/xml",
      url: `${base}/sitemap.xml`,
    },
    {
      identifier: urn("doc", "developers"),
      displayName: "Developer documentation",
      type: "text/html",
      url: `${base}/${brand.defaultLocale}/developers`,
    },
    ...(brand.ecommerceEnabled
      ? [
          {
            identifier: urn("doc", "pricing"),
            displayName: "Machine-readable pricing model",
            type: "text/markdown",
            url: `${base}/pricing.md`,
          },
        ]
      : []),
    ...(features.webMcp
      ? [
          {
            identifier: urn("doc", "webmcp-tools"),
            displayName: "WebMCP in-browser tool inventory",
            type: "text/html",
            url: `${base}/${brand.defaultLocale}/webmcp-check`,
            representativeQueries: [
              "which in-browser tools does this store expose to agents",
              "add a product to the cart from the page",
            ],
          },
        ]
      : []),
  ];

  // Legacy `resources` view of the same list: the pre-ARD shape this route
  // served first ({rel, href, type, title}) — kept so an existing consumer
  // doing `resources.map(...)` keeps working. ARD ignores unknown top-level
  // members, so the two views coexist.
  const relFor = (entry: { identifier: string }) => {
    const name = entry.identifier.split(":").pop() ?? "";
    return (
      {
        "llms-overview": "overview",
        openapi: "service-desc",
        tools: "service",
        server: "mcp-server",
        auth: "auth",
        "agent-skills": "agent-skills",
        sitemap: "sitemap",
        developers: "service-doc",
        pricing: "pricing",
        "webmcp-tools": "webmcp-tools",
      } as Record<string, string>
    )[name] ?? name;
  };
  const resources = entries.map((entry) => ({
    rel: relFor(entry),
    href: entry.url,
    type: entry.type,
    title: entry.displayName,
    trustManifest,
  }));

  return Response.json(
    {
      specVersion: "1.0",
      host: { displayName: brand.storeName, identifier: `did:web:${host}` },
      name: brand.storeName,
      description: brand.metadata.description,
      trustManifest,
      entries: entries.map((entry) => ({ ...entry, trustManifest })),
      resources,
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
