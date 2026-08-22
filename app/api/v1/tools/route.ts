import { NextRequest } from "next/server";
import { buildToolManifest, listTools } from "@/lib/tools/registry";
import {
  mcpPublicDisabledResponse,
  mcpPublicOptionsResponse,
} from "@/lib/tools/public-gate";

export const runtime = "nodejs";

/**
 * Offentligt endpoint — ingen auth. Returnerer manifest over alle registrerede
 * tools (navn, beskrivelse, scope, om revertible). Bruges af journalister/devs
 * der vil opdage hvad shoppen kan, og af MCP-klienter ved discovery.
 *
 * Filtreres på `?scope=` for at vise kun tools en given scope-liste dækker.
 * Gated på `mcpPublic` (runtime-flag, default-on) — flag-off ⇒ 404.
 */
export async function GET(request: NextRequest) {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;

  const scopeFilter = request.nextUrl.searchParams.get("scope");
  const verbose = request.nextUrl.searchParams.get("schema") === "true";

  if (verbose) {
    // Fuldt manifest inkl. JSON Schema for input — bruges af MCP-klienter
    // til discovery og af journalister/devs der vil inspect API'et grundigt.
    const manifest = buildToolManifest().filter(
      (t) => !scopeFilter || t.scope === scopeFilter,
    );
    return Response.json({
      count: manifest.length,
      tools: manifest,
      docs: "POST /api/v1/tools/<name> med Bearer-key for at kalde et tool",
    });
  }

  // Compact-version uden schemas (default — mindre response size)
  const tools = listTools()
    .filter((t) => !scopeFilter || t.scope === scopeFilter)
    .map((t) => ({
      name: t.name,
      description: t.description,
      scope: t.scope,
      revertible: t.revertible ?? false,
    }));

  return Response.json({
    count: tools.length,
    tools,
    docs: "POST /api/v1/tools/<name> with a Bearer key to call a tool. Add ?schema=true for the full JSON schema.",
  });
}

/**
 * Every method this route answers. `HEAD` has no export behind it: Next fills
 * it in from `GET` whenever a module exports `GET` and not `HEAD`, so
 * `HEAD /api/v1/tools` really does run the gated handler above and belongs in
 * the list. The test derives this value from the module's own exports plus that
 * one framework-implemented verb, so a third export cannot land without the
 * string going stale in view.
 */
const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

/**
 * The catalogue's half of the gap #429 closed on `/api/mcp`. With no `OPTIONS`
 * export, Next answered the verb itself — measured on a production build:
 * `204 Allow: GET, HEAD, OPTIONS`, returned by framework code that never
 * reaches `mcpPublicDisabledResponse()`. A shop that had turned the agentic
 * surface off therefore 404'd the catalogue while still confirming, on the one
 * verb nobody checks, that a route was mounted at this path.
 *
 * Exporting the verb puts it behind the same gate. For a caller the gate
 * admits, the status and `Allow` value are exactly what Next's substitute
 * sent. The one addition is the helper's `Cache-Control: no-store`, which on a
 * production build of this project is superseded by the config's own value and
 * in dev is not — so "byte-identical response" would be the wrong claim to
 * make, and is not made. See `mcpPublicOptionsResponse` for what was measured.
 */
export async function OPTIONS(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;

  return mcpPublicOptionsResponse(ALLOWED_METHODS);
}
