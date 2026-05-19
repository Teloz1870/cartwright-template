import { NextRequest } from "next/server";
import { buildToolManifest, listTools } from "@/lib/tools/registry";

export const runtime = "nodejs";

/**
 * Offentligt endpoint — ingen auth. Returnerer manifest over alle registrerede
 * tools (navn, beskrivelse, scope, om revertible). Bruges af journalister/devs
 * der vil opdage hvad shoppen kan, og af MCP-klienter ved discovery.
 *
 * Filtreres på `?scope=` for at vise kun tools en given scope-liste dækker.
 */
export function GET(request: NextRequest) {
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
    docs: "POST /api/v1/tools/<name> med Bearer-key for at kalde et tool. Tilføj ?schema=true for fuld JSON-schema.",
  });
}
