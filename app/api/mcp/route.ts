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
 * surface turned off returns the same `404` to every caller and stays
 * indistinguishable from a shop that never had an MCP endpoint. Only once the
 * endpoint admits to existing does the `Origin` check get to answer `403` — the
 * reverse order would let a foreign origin tell the two states apart.
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
