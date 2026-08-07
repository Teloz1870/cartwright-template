import "server-only";

import { getFeatures } from "@/lib/brand";

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
export async function mcpPublicDisabledResponse(): Promise<Response | null> {
  const features = await getFeatures();
  if (features.mcpPublic) return null;
  return Response.json({ error: "not_found" }, { status: 404 });
}
