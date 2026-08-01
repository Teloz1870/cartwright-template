import { brand } from "@/brand.config";
import { getFeatures } from "@/lib/brand";

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
 *
 * Gated på `mcpPublic` (DB-merged, runtime-toggleable — derfor force-dynamic,
 * ikke force-static som før): et server card der peger på endpoints der 404'er
 * ville efterlade offentligt opdagelige døde referencer og modsige målet om at
 * en slået-fra overflade er uskelnelig fra en ikke-eksisterende (codex-review
 * fold-in 2026-07-15; afløser #367-beslutningen "server card altid-on").
 * CDN-cachen (s-maxage) skærmer stadig endpointet mod trafik.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const features = await getFeatures();
  if (!features.mcpPublic) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

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
