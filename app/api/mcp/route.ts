import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { brand } from "@/brand.config";
import { listTools, invokeTool } from "@/lib/tools/registry";
import {
  apiErrorResponse,
  authenticateApiKey,
  actorToAuditString,
} from "@/lib/api-auth";
import type { ApiKeyActor } from "@/lib/api-auth";
import { mcpPublicDisabledResponse } from "@/lib/tools/public-gate";
import { mcpOriginRejection } from "@/lib/mcp/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Model Context Protocol-endpoint. Claude Desktop og andre MCP-klienter
 * forbinder hertil for at få den fulde tool-overflade automatisk discovered.
 *
 * Streamable HTTP er den moderne MCP-transport (afløser SSE) — én HTTP-route
 * der håndterer både request/response og server-sent stream over POST.
 *
 * Auth: Bearer API-key i Authorization header. Tools' scope-krav håndhæves
 * pr. invocation via samme invokeTool() som REST-endpointet.
 */
async function buildMcpServer(actor: ApiKeyActor, request: NextRequest): Promise<McpServer> {
  const server = new McpServer(
    {
      name: brand.storeSlug,
      version: "0.2.0",
    },
    {
      instructions:
        `Du er forbundet til ${brand.storeName}'s AI-first webshop. Du har adgang til ` +
        listTools().length +
        " tools til at styre katalog, ordrer, rabatkoder, sider og kampagner. " +
        "Each tool requires a scope assigned to your API key. Destructive operations " +
        "(*.delete, audit.revert) require explicit confirm:true in the arguments. " +
        "Brug marketing.create_campaign til at orkestrere weekend-kampagner i ét kald.",
    },
  );

  const ip = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  // Registrér hver tool fra registry'et hos MCP-serveren. inputSchema er
  // forsimplet til z.any() — den rigtige Zod-validering sker inde i
  // invokeTool så vi får samme strenghed som REST-endpointet.
  for (const tool of listTools()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        // MCP forventer ZodRawShape; vi giver en pass-through schema
        // og lader registry'en lave den rigtige validering.
        inputSchema: { args: z.any().optional() } as { args: z.ZodAny | z.ZodOptional<z.ZodAny> },
      },
      // MCP-handler får { args } fra wrapped schema. Vi unwrapper og kalder
      // tværgående invokeTool så scope-check + audit kører ens overalt.
      async (input: { args?: unknown }) => {
        const result = await invokeTool(
          tool.name,
          input.args ?? {},
          {
            actor: actorToAuditString(actor) as `apikey:${string}`,
            requestId: randomUUID(),
            ip,
            userAgent,
          },
          actor.scopes,
        );

        if (result.ok) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result.result, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `[error ${result.status}] ${result.error}`,
            },
          ],
          isError: true,
        };
      },
    );
  }

  return server;
}

/**
 * What every verb passes through before anything else runs.
 *
 * Order is load-bearing: the `mcpPublic` gate answers first, so a shop with the
 * surface turned off returns the same `404` to every caller. Only once the
 * endpoint admits to existing does the `Origin` check get to answer `403` — the
 * reverse order would let a foreign origin tell the two states apart.
 *
 * That makes a turned-off shop *near*-indistinguishable from one that never had
 * the endpoint, and the gap between those two words is worth stating: a verb no
 * handler covers (`PUT`, `PATCH`) still gets the framework's `405`, and the
 * `404` itself carries a JSON body an absent route would not produce. Every
 * verb that reaches a handler here is gated — `OPTIONS` included, which is the
 * whole reason it is exported below.
 */
async function guard(request: NextRequest): Promise<Response | null> {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;
  return await mcpOriginRejection(request.headers.get("origin"));
}

async function serve(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if ("error" in auth) {
    return apiErrorResponse(auth.error);
  }

  const server = await buildMcpServer(auth.actor, request);
  // Stateless mode (sessionIdGenerator: undefined). Hver request er
  // selvstændig: ingen krav om initialize-først, ingen session-tracking.
  // Egner sig perfekt til Next.js serverless-runtime hvor cross-request
  // state alligevel ikke er garanteret. Klienter som Claude Desktop
  // håndterer både stateful og stateless transports.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

async function handle(request: NextRequest) {
  const blocked = await guard(request);
  if (blocked) return blocked;
  return serve(request);
}

/**
 * GET uden Authorization-header → returnér menneske-/journalist-venlig
 * intro så folk der klikker linket fra footer ikke får en bar 401.
 * Hvis Authorization ER sat, fortsætter vi til normal MCP-handling.
 */
export async function GET(request: NextRequest) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const hasAuth = request.headers.has("authorization");
  if (!hasAuth) {
    return Response.json(
      {
        name: `${brand.storeSlug} MCP`,
        version: "0.2.0",
        protocol: "Model Context Protocol (Streamable HTTP transport)",
        about:
          `Dette endpoint giver AI-klienter som Claude Desktop adgang til at styre ${brand.storeName}'s drift. ` +
          "Add a Bearer key in the Authorization header to open the session.",
        publicCatalog: "/api/v1/tools",
        howToConnect: {
          clientConfig: {
            mcpServers: {
              [brand.storeSlug]: {
                url: `${brand.url}/api/mcp`,
                headers: {
                  Authorization: "Bearer sb_live_...",
                },
              },
            },
          },
          getKey:
            "Opret en key i /admin/api-keys (kun synlig for shop-ejeren)",
        },
        whyMcp:
          "MCP is the open standard for connecting AI clients to real systems. " +
          "We were Denmark's first webshop with a public MCP endpoint.",
        manifest: "/manifest",
        liveChangelog: "/changelog",
      },
      { status: 200 },
    );
  }
  return serve(request);
}
export const POST = handle;
export const DELETE = handle;

/**
 * Every method this route answers. RFC 9110 §10.2.1 asks only for a
 * comma-separated list, not a sorted one; the order here matches what Next's
 * own automatic handler produced (it sorts), so the header a caller sees does
 * not change character for character.
 *
 * `HEAD` is in the list and NOT in the exports below on purpose: Next fills it
 * in from `GET` whenever a module exports `GET` and not `HEAD`
 * (`autoImplementMethods`, `methods.HEAD = handlers.GET`). So `HEAD /api/mcp`
 * really does run the gated `GET` handler, and omitting it here would advertise
 * fewer methods than the resource supports. The test derives this value from
 * the module's own exports plus that one framework-implemented verb, so a fifth
 * export cannot land without the string going stale in view.
 */
const ALLOWED_METHODS = "DELETE, GET, HEAD, OPTIONS, POST";

/**
 * `OPTIONS` is the verb Next fills in for you. When a route module exports no
 * handler for it, the framework installs one that answers `204` with an `Allow`
 * header — and that substitute is not this route's code, so it never reaches
 * `guard()`. The effect was that a shop with `mcpPublic` turned off replied
 * `404` to GET/POST/DELETE while still answering
 * `204 Allow: DELETE, GET, HEAD, OPTIONS, POST` to anyone who asked — exactly
 * the tell the 404-before-403 ordering in `guard()` exists to remove, handed
 * out on the one method nobody checks. Exporting the verb puts it behind the
 * same gate.
 *
 * What this does NOT close, stated rather than implied: a method the route
 * handles for nobody — `PUT`, `PATCH` — still gets the framework's `405`, which
 * is its own "something is mounted here" tell, and the sibling REST surface
 * (`/api/v1/tools*`) still answers the automatic `OPTIONS`. Both are the same
 * shape of gap and neither is fixed here.
 *
 * Deliberately NOT a CORS preflight response: the route sends no
 * `Access-Control-Allow-*` headers and must not start, so a browser preflight
 * for `/api/mcp` is still meant to fail. What ships is the same plain HTTP
 * `OPTIONS` answer — same `204`, same `Allow` value — only now gated, plus the
 * two headers below that the framework's substitute never sent.
 *
 * The two headers state what the body cannot: this answer varies with the
 * caller's `Origin`, and with a flag an admin can flip without a redeploy.
 *
 * On the wire only one of them survives, and the reason is local, not a rule of
 * the framework: this project's own `next.config.ts` `headers()` block sets
 * `Cache-Control: no-cache, must-revalidate` on everything outside
 * `_next/static` in production, and Next (on this version) appends a handler's
 * header only when the name is not already set — `vary` is one of the few
 * exempt names, so `Vary: Origin` is added while `no-store` is dropped.
 * (Measured on a production build; the docs describe handler headers as
 * overriding config ones, so do not rely on either direction.) A fork that
 * trims that config rule gets `no-store` through. Both
 * values bar a shared cache from reusing this without revalidating, and the
 * handler states its own the same way `mcpForbiddenOriginResponse()` does,
 * rather than depending on a config file it does not own.
 */
export async function OPTIONS(request: NextRequest) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  return new Response(null, {
    status: 204,
    headers: {
      allow: ALLOWED_METHODS,
      "cache-control": "no-store",
      vary: "Origin",
    },
  });
}
