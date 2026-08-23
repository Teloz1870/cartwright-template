import "server-only";

import { getFeatures } from "@/lib/brand";
import { problemResponse } from "@/lib/api-problem";

/**
 * Gate for den offentlige agentiske tool-overflade: /api/mcp og
 * /api/v1/tools[/name]. Companion til a2aDisabledResponse (lib/a2a/http.ts)
 * og acpDisabledResponse (lib/acp/http.ts), men læser den DB-MERGEDE
 * feature-view (getFeatures) fordi `mcpPublic` er runtime-toggleable —
 * en admin skal kunne slå overfladen fra i /admin/features uden redeploy.
 *
 * Hvorfor 404 og ikke 403: en slået-fra overflade skal være uskelnelig fra
 * en ikke-eksisterende for udefrakommende scannere (samme rationale som A2A).
 *
 * OBS: features.set er selv et REST-tool — slår man mcpPublic FRA over REST,
 * kan man kun slå den TIL igen via /admin/features-UI'et. Det er tilsigtet.
 */
export async function mcpPublicDisabledResponse(instance = "/api/mcp"): Promise<Response | null> {
  const features = await getFeatures();
  if (features.mcpPublic) return null;
  return problemResponse({
    status: 404,
    title: "Not Found",
    detail: "The public agent interface is not enabled on this site.",
    instance,
    code: "agent_interface_not_found",
    resolution: "Use the public website and sitemap, or ask the site operator whether agent access is available.",
  });
}

/**
 * The `OPTIONS` answer a gated route sends once the gate has let the caller
 * through — the body of an `export async function OPTIONS` whose first act is
 * `mcpPublicDisabledResponse()`.
 *
 * It exists because a route module that exports no `OPTIONS` does not thereby
 * refuse the verb: Next installs its own handler (`autoImplementMethods`),
 * which answers `204` with an `Allow` list. That substitute is framework code,
 * not the route's, so it never reaches any gate — a shop with `mcpPublic` off
 * answered `404` on its real verbs while still enumerating them to whoever
 * asked `OPTIONS`. #429 closed that on `/api/mcp`; the callers of this helper
 * are the rest of the same surface.
 *
 * Two things it deliberately does NOT do:
 *
 *  - **No CORS grant rides along.** None of these routes answers a preflight
 *    today and this must not quietly become the place one starts. The one
 *    caller whose GET *does* send `Access-Control-Allow-Origin: *`
 *    (`/.well-known/mcp.json`) keeps that on GET only, exactly as before.
 *  - **No `Vary: Origin`.** `/api/mcp` sets it because it alone varies by
 *    `Origin` (`mcpOriginRejection`); claiming it here would describe a
 *    variance these routes do not have. That is also why `/api/mcp` builds its
 *    own response instead of calling this.
 *
 * `no-store` is the one header beyond `Allow`, and the one place a caller can
 * tell the new handler from the framework's: the reply depends on a DB-merged
 * flag an admin can flip without a redeploy, so a shared cache must not serve
 * a pre-toggle answer.
 *
 * Which `Cache-Control` a caller actually sees differs between environments,
 * and the reason is knowable rather than mysterious. Measured on this project,
 * Next 16.3: in PRODUCTION the value is
 * the one `next.config.ts` sets (`no-cache, must-revalidate`, applied to every
 * non-`_next/static` path) and this `no-store` does not reach the wire; in DEV
 * that config rule is not applied and `no-store` does. That is not a quirk to
 * shrug at: `next/dist/server/send-response.js` appends a handler header only
 * when the name is not already set, exempting the few that legitimately repeat
 * (`set-cookie`, `vary`, the two `*-authenticate`s) — so a `next.config.ts`
 * rule wins any single-valued header it has already written, which is exactly
 * what the production measurement shows. What the handler is responsible for is stating
 * its own intent rather than inheriting it from a config file it does not own;
 * every observed outcome is uncacheable, which is all that is required.
 *
 * @param allow every method the route answers, as an `Allow` header value —
 *   including the `HEAD` that Next implements from `GET` and that therefore
 *   has no export to derive it from.
 */
export function mcpPublicOptionsResponse(allow: string): Response {
  return new Response(null, {
    status: 204,
    headers: { allow, "cache-control": "no-store" },
  });
}
