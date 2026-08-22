import {
  mcpPublicDisabledResponse,
  mcpPublicOptionsResponse,
} from "@/lib/tools/public-gate";
import { getBrand } from "@/lib/brand";
import { buildToolManifest } from "@/lib/tools/registry";
import { isPublicAgentTool } from "@/lib/tools/public";
import { MCP_SERVER_VERSION } from "@/lib/mcp/version";

/**
 * GET /.well-known/mcp.json — MCP "Server Card" (SEP-1649 / SEP-2127, draft).
 *
 * Lader AI-klienter (Claude, ChatGPT, Cursor m.fl.) opdage shoppens MCP-server
 * og dens offentlige read-only værktøjer uden manuel konfiguration. Schema'et
 * er stadig draft, så kortet bevarer de tidligere compatibility-felter samtidig
 * med den moderne identitet, version, endpoint, transport og tool-preview.
 * Det fulde tool-katalog ligger på /api/v1/tools.
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
  // Was an inlined `getFeatures()` + hand-rolled 404 — byte-identical to what
  // `mcpPublicDisabledResponse()` returns, but not a *call* to it, which is
  // precisely why this route was missed when #429 swept the gated surface for
  // the OPTIONS gap. Going through the shared gate makes it findable.
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;

  const brand = await getBrand();
  const serverUrl = `${brand.url}/api/mcp`;
  const tools = buildToolManifest()
    .filter((tool) => isPublicAgentTool(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputJsonSchema,
      readOnly: true,
    }));
  const card = {
    name: brand.storeName,
    title: brand.storeName,
    description: brand.metadata.description,
    version: MCP_SERVER_VERSION,
    serverUrl,
    transport: "streamable-http",
    tools,
    websiteUrl: brand.url,
    remotes: [
      {
        url: serverUrl,
        transport: "streamable-http",
        authentication: {
          anonymous: "public read-only tools",
          bearer: "required for private data and all actions",
        },
      },
    ],
    _meta: {
      "cartwright/toolCatalog": `${brand.url}/api/v1/tools`,
      "cartwright/openapi": `${brand.url}/openapi.json`,
      "cartwright/developers": `${brand.url}/${brand.defaultLocale}/developers`,
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

/**
 * Every method this route answers. `HEAD` has no export because Next
 * implements it from `GET`; see the note in `app/api/v1/tools/route.ts`.
 */
const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

/**
 * The server card's half of the #429 gap: with no export, Next answered
 * `OPTIONS` itself, outside the gate, so a shop with `mcpPublic` off replied
 * `404` to the card while still confirming a route sits at
 * `/.well-known/mcp.json` — a well-known path whose mere presence identifies
 * the shop as running an MCP server, which is the one inference the 404 is
 * there to deny.
 *
 * Note what stays as it was: this route's GET sends
 * `Access-Control-Allow-Origin: *` because a server card is public metadata
 * browser clients fetch cross-origin, but that is a *simple* GET, which needs
 * no preflight. Next's substitute never answered a preflight either, so one
 * has never succeeded here — and this change does not begin answering them.
 * Turning that on is a separate decision about a capability, not part of
 * closing a gate.
 */
export async function OPTIONS(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;

  return mcpPublicOptionsResponse(ALLOWED_METHODS);
}
