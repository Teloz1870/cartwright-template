import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { brand } from "@/brand.config";
import { listTools, invokeTool } from "@/lib/tools/registry";
import {
  authenticateApiKey,
  actorToAuditString,
} from "@/lib/api-auth";
import type { ApiKeyActor } from "@/lib/api-auth";
import { mcpPublicDisabledResponse } from "@/lib/tools/public-gate";
import { mcpOriginRejection } from "@/lib/mcp/origin";
import { MCP_SERVER_VERSION } from "@/lib/mcp/version";
import { isPublicAgentTool, publicAgentTools, PUBLIC_AGENT_SCOPES } from "@/lib/tools/public";
import { publicAgentPerIpLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { problemResponse } from "@/lib/api-problem";
import { GET as getLlmsTxt } from "@/app/llms.txt/route";
import sitemap from "@/app/sitemap";
import { getBrand } from "@/lib/brand";
import { getDefaultLegalContent } from "@/lib/legal/default-content";
import { hasScope } from "@/lib/scopes";

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
async function buildMcpServer(actor: ApiKeyActor | null, request: NextRequest): Promise<McpServer> {
  const registryTools = listTools();
  const tools = actor
    ? registryTools.filter((tool) => hasScope(actor.scopes, tool.scope))
    : publicAgentTools(registryTools);
  const server = new McpServer(
    {
      name: brand.storeSlug,
      version: MCP_SERVER_VERSION,
    },
    {
      instructions:
        `Du er forbundet til ${brand.storeName}'s AI-first webshop. Du har adgang til ` +
        tools.length +
        (actor
          ? " scoped tools til at styre platformen. "
          : " public read-only tools til at browse katalog og publicerede sider. ") +
        "Private data and every write require a scoped API key. Destructive operations " +
        "(*.delete, audit.revert) require explicit confirm:true in the arguments." +
        (actor ? " Brug marketing.create_campaign til at orkestrere weekend-kampagner i ét kald." : ""),
    },
  );

  const ip = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  for (const tool of tools) {
    const publicReadOnly = isPublicAgentTool(tool.name);
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        ...(tool.output ? { outputSchema: z.object({ result: tool.output }) } : {}),
        ...(publicReadOnly
          ? {
              annotations: {
                title: tool.name,
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
              },
            }
          : {}),
      },
      async (input: unknown) => {
        const result = await invokeTool(
          tool.name,
          input,
          {
            actor: actor
              ? (actorToAuditString(actor) as `apikey:${string}`)
              : "system:public-agent",
            requestId: randomUUID(),
            ip,
            userAgent,
          },
          actor?.scopes ?? PUBLIC_AGENT_SCOPES,
        );

        if (result.ok) {
          const serializedResult = JSON.parse(JSON.stringify(result.result)) as unknown;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(serializedResult, null, 2),
              },
            ],
            ...(tool.output ? { structuredContent: { result: serializedResult } } : {}),
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

  const resolvedBrand = await getBrand();
  server.registerResource("llms.txt", `${resolvedBrand.url}/llms.txt`, {
    title: "Agent-readable site guide",
    description: "Capabilities, navigation and safe-use guidance for this public site.",
    mimeType: "text/markdown",
  }, async (uri) => {
    const response = await getLlmsTxt();
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: await response.text() }] };
  });
  server.registerResource("sitemap", `${resolvedBrand.url}/sitemap.xml`, {
    title: "Public sitemap",
    description: "URLs for public, indexable content.",
    mimeType: "application/xml",
  }, async (uri) => {
    const entries = await sitemap();
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => `<url><loc>${entry.url}</loc></url>`).join("")}</urlset>`;
    return { contents: [{ uri: uri.href, mimeType: "application/xml", text: xml }] };
  });
  server.registerResource("public-trust", `${resolvedBrand.url}/${resolvedBrand.defaultLocale}/about`, {
    title: "Public company, contact and policy information",
    description: "Public trust information. No customer or operational data is included.",
    mimeType: "application/json",
  }, async (uri) => {
    const locale = resolvedBrand.defaultLocale;
    const trust = {
      company: resolvedBrand.company,
      contact: resolvedBrand.contact,
      about: getDefaultLegalContent("about", locale),
      privacy: getDefaultLegalContent("privacy", locale),
    };
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(trust, null, 2) }] };
  });

  return server;
}

async function normalizeLegacyArguments(request: NextRequest): Promise<Request> {
  if (request.method !== "POST") return request;
  try {
    const body = await request.clone().json() as { method?: string; params?: { arguments?: unknown } };
    const args = body.params?.arguments;
    if (body.method === "tools/call" && args && typeof args === "object" && "args" in args) {
      body.params!.arguments = (args as { args: unknown }).args;
      return new Request(request.url, { method: request.method, headers: request.headers, body: JSON.stringify(body) });
    }
  } catch {
    // The MCP transport owns malformed-body errors; compatibility parsing is fail-soft.
  }
  return request;
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
  const gated = await mcpPublicDisabledResponse(request.nextUrl.pathname);
  if (gated) return gated;
  return await mcpOriginRejection(request.headers.get("origin"));
}

async function serve(request: NextRequest) {
  const hasToken = request.headers.has("authorization");
  const auth = hasToken ? await authenticateApiKey(request) : null;
  if (auth && "error" in auth) {
    return problemResponse({
      status: auth.error.status,
      title: auth.error.status === 401 ? "Unauthorized" : "Forbidden",
      detail: auth.error.body.error,
      instance: request.nextUrl.pathname,
      code: auth.error.status === 401 ? "authentication_required" : "insufficient_scope",
      resolution: "Send a valid Bearer API key with the required scope, or omit Authorization to use public read-only tools.",
    });
  }

  const rate = !auth
    ? publicAgentPerIpLimiter.check(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown")
    : null;
  if (rate && !rate.allowed) return problemResponse({
    status: 429,
    title: "Too Many Requests",
    detail: "The anonymous public-agent request limit has been exceeded.",
    instance: request.nextUrl.pathname,
    code: "rate_limit_exceeded",
    resolution: `Retry after ${rate.retryAfterSec} seconds or authenticate with a scoped API key.`,
    headers: { ...rateLimitHeaders(rate), "Retry-After": String(rate.retryAfterSec) },
  });

  const server = await buildMcpServer(auth && !("error" in auth) ? auth.actor : null, request);
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
  const response = await transport.handleRequest(await normalizeLegacyArguments(request));
  if (rate) for (const [name, value] of Object.entries(rateLimitHeaders(rate))) response.headers.set(name, String(value));
  return response;
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
        version: MCP_SERVER_VERSION,
        protocol: "Model Context Protocol (Streamable HTTP transport)",
        about:
          `Dette endpoint giver AI-klienter anonym, rate-limited læseadgang til ${brand.storeName}'s offentlige katalog og sider. ` +
          "Add a scoped Bearer key for private reads or operational actions.",
        anonymousTools: publicAgentTools(listTools()).map((tool) => tool.name),
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
 * is its own "something is mounted here" tell. The sibling REST surface
 * (`/api/v1/tools*`, `/.well-known/mcp.json`) was the same shape of gap and is
 * now closed the same way; other flag-gated routes that export no `OPTIONS`
 * still are not.
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
