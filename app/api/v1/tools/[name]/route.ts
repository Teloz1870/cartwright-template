import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { invokeTool, getTool } from "@/lib/tools/registry";
import { requireApiScope, apiErrorResponse, actorToAuditString } from "@/lib/api-auth";
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
    return Response.json(
      { ok: false, error: `Tool not found: ${toolName}` },
      { status: 404 },
    );
  }

  // Auth: kræv den scope tool'et beder om. Hvis API-key ikke har den,
  // returnerer requireApiScope 403 før vi når til invokeTool.
  const auth = await requireApiScope(request, tool.scope);
  if ("error" in auth) {
    return apiErrorResponse(auth.error);
  }

  let args: unknown;
  try {
    args = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const result = await invokeTool(
    toolName,
    args,
    {
      actor: actorToAuditString(auth.actor) as `apikey:${string}`,
      requestId: randomUUID(),
      ip: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    },
    auth.actor.scopes,
  );

  if (result.ok) {
    return Response.json({ ok: true, result: result.result });
  }
  return Response.json(
    {
      ok: false,
      error: result.error,
      ...(result.status === 422 ? { issues: result.issues } : {}),
    },
    { status: result.status },
  );
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
