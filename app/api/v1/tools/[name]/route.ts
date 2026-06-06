import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { invokeTool, getTool } from "@/lib/tools/registry";
import { requireApiScope, apiErrorResponse, actorToAuditString } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { name: toolName } = await params;
  const tool = getTool(toolName);
  if (!tool) {
    return Response.json(
      { error: `Tool not found: ${toolName}` },
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
      { error: "Invalid JSON body" },
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
