import { brand } from "@/brand.config";

/**
 * GET /.well-known/mcp.json — MCP "Server Card" (SEP-1649 / SEP-2127, draft).
 *
 * Lader AI-klienter (Claude, ChatGPT, Cursor m.fl.) opdage shoppens MCP-server
 * og dens transport uden manuel konfiguration. Schema'et er stadig draft, og
 * spec-guidance er "minimal information, not maximal" — så vi udstiller kun
 * det stabile minimum: identitet + remote-endpoint. Det fulde tool-katalog
 * ligger på /api/v1/tools.
 *
 * Server-cards SKAL serveres med CORS `*` (kun offentlig metadata, ingen
 * credentials) så browser-baserede klienter kan hente dem.
 */
export const dynamic = "force-static";

export function GET(): Response {
  const card = {
    name: brand.storeName,
    title: brand.storeName,
    description: brand.metadata.description,
    websiteUrl: brand.url,
    remotes: [
      {
        url: `${brand.url}/api/mcp`,
        transport: "streamable-http",
      },
    ],
    _meta: {
      "cartwright/toolCatalog": `${brand.url}/api/v1/tools`,
      // Point agents at the shadcn-compatible component registry when it's public.
      ...((brand.features as { componentRegistryPublic?: boolean }).componentRegistryPublic
        ? { "cartwright/componentRegistry": `${brand.url}/api/registry` }
        : {}),
    },
  };
  return new Response(JSON.stringify(card, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
