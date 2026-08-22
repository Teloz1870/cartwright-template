import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { invokeTool, getTool } from "@/lib/tools/registry";
import { requireApiScope, actorToAuditString } from "@/lib/api-auth";
import { isPublicAgentTool, PUBLIC_AGENT_SCOPES } from "@/lib/tools/public";
import { publicAgentPerIpLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { invokeProblem, problemResponse } from "@/lib/api-problem";
import {
  mcpPublicDisabledResponse,
  mcpPublicOptionsResponse,
} from "@/lib/tools/public-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Some tools are long-running (content.import_site scrapes + imports many
// pages); raise the function ceiling so they don't silently time out.
export const maxDuration = 300;

/**
 * Den eneste REST-dispatcher. Et tool kaldes via:
 *
 *   POST /api/v1/tools/products.search
 *   Authorization: Bearer sb_live_...
 *   Content-Type: application/json
 *   { "q": "aviator", "limit": 5 }
 *
 * Tool-navnet i URL'en er kanonisk ("domain.verb"); ingen route-tabel skal
 * vedligeholdes. Når et nyt tool registreres i registry.ts, er det
 * øjeblikkeligt eksponeret her — én sandhed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;

  const { name: toolName } = await params;
  const tool = getTool(toolName);
  if (!tool) {
    return problemResponse({ status: 404, title: "Not Found", detail: `Tool not found: ${toolName}`, instance: request.nextUrl.pathname, code: "tool_not_found", resolution: "Use GET /api/v1/tools to discover available tools." });
  }

  const anonymous = !request.headers.has("authorization") && isPublicAgentTool(toolName);
  const rate = anonymous
    ? publicAgentPerIpLimiter.check(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown")
    : null;
  if (rate && !rate.allowed) {
    return problemResponse({
      status: 429,
      title: "Too Many Requests",
      detail: "The anonymous public-agent request limit has been exceeded.",
      instance: request.nextUrl.pathname,
      code: "rate_limit_exceeded",
      resolution: `Retry after ${rate.retryAfterSec} seconds or authenticate with a scoped API key.`,
      headers: { ...rateLimitHeaders(rate), "Retry-After": String(rate.retryAfterSec) },
    });
  }

  const auth = anonymous ? null : await requireApiScope(request, tool.scope);
  if (auth && "error" in auth) return problemResponse({
    status: auth.error.status,
    title: auth.error.status === 401 ? "Unauthorized" : "Forbidden",
    detail: auth.error.body.error,
    instance: request.nextUrl.pathname,
    code: auth.error.status === 401 ? "authentication_required" : "insufficient_scope",
    resolution: "Send a valid Bearer API key with the required scope.",
  });

  let args: unknown;
  try {
    args = await request.json();
  } catch {
    return problemResponse({ status: 400, title: "Invalid JSON", detail: "Invalid JSON body", instance: request.nextUrl.pathname, code: "invalid_json", resolution: "Send a valid application/json request body." });
  }

  const result = await invokeTool(
    toolName,
    args,
    {
      actor: auth && !("error" in auth)
        ? (actorToAuditString(auth.actor) as `apikey:${string}`)
        : "system:public-agent",
      requestId: randomUUID(),
      ip: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    },
    auth && !("error" in auth) ? auth.actor.scopes : PUBLIC_AGENT_SCOPES,
  );

  if (result.ok) {
    return Response.json(
      { ok: true, result: result.result },
      { headers: rate ? rateLimitHeaders(rate) : undefined },
    );
  }
  const response = invokeProblem(result, request.nextUrl.pathname);
  if (rate) for (const [name, value] of Object.entries(rateLimitHeaders(rate))) response.headers.set(name, String(value));
  return response;
}

/**
 * GET henter tool-manifest (description, scope, input-schema).
 * Bruges af klienter der vil opdage tool-overflade dynamisk.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;

  const { name: toolName } = await params;
  const tool = getTool(toolName);
  if (!tool) {
    return Response.json(
      { error: `Tool not found: ${toolName}` },
      { status: 404 },
    );
  }
  return Response.json({
    name: tool.name,
    description: tool.description,
    scope: tool.scope,
    revertible: tool.revertible ?? false,
  });
}

/**
 * Every method this route answers. `HEAD` is here without an export because
 * Next implements it from `GET`; see the sibling note in `../route.ts`.
 */
const ALLOWED_METHODS = "GET, HEAD, OPTIONS, POST";

/**
 * The dispatcher's half of the same gap. Gated on `mcpPublic` and nothing else
 * — deliberately: this handler never looks at `params.name`, so it answers the
 * same `204` for a tool that exists and one that does not.
 *
 * That is the safe direction, and it is worth saying which way round it runs.
 * Resolving the name here would turn a verb that needs no key into an oracle
 * for "is `orders.refund` registered on this shop?" — cheap to sweep across a
 * guessed vocabulary, and a finer-grained answer than the surface owes an
 * unauthenticated caller. The catalogue at `/api/v1/tools` is the place that
 * discloses which tools exist, on purpose, through the same flag.
 */
export async function OPTIONS(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;

  return mcpPublicOptionsResponse(ALLOWED_METHODS);
}
