import "server-only";

import { zodToJsonSchema } from "zod-to-json-schema";
import { getTool } from "@/lib/tools/registry";
import { CUSTOMER_TOOL_ALLOWLIST } from "@/lib/ai/client";

/**
 * Konverterer registry's Zod-baserede tool-skemaer til Gemini Live's
 * function-declaration-format. Bruges af /api/live/token til at pakke
 * tool-defs ind i `setup`-messagen så Google ved hvilke functions modellen
 * kan kalde.
 *
 * Gemini-konvention:
 *   - Tool-navne: matches /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/ (intet ".")
 *     → vi mapper registry's "domain.verb" til "domain_verb".
 *   - Parameters er JSON-schema, ikke Zod. Vi bruger samme zod-to-json-schema
 *     som /api/v1/tools allerede gør, så schema-formatet er konsistent.
 *
 * Sikkerhedsbarriere:
 *   - Returnerer KUN tools der både er i CUSTOMER_TOOL_ALLOWLIST OG i
 *     `allowedToolNames` (voiceShopAllowedTools fra DB).
 *   - Token-endpointet låser denne liste via Gemini's
 *     lockAdditionalFields=["tools"], så browseren kan ikke
 *     udvide allowlisten efter token er udstedt.
 */

type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type GeminiToolSet = {
  functionDeclarations: GeminiFunctionDeclaration[];
};

export type VoiceToolBundle = {
  geminiTools: GeminiToolSet[];
  /** snake_case → registry dot.name */
  nameMap: Record<string, string>;
  /** Faktisk validerede navne der kom igennem (subset af allowedToolNames). */
  effectiveTools: string[];
};

export function buildVoiceShopTools(
  allowedToolNames: readonly string[],
): VoiceToolBundle {
  const declarations: GeminiFunctionDeclaration[] = [];
  const nameMap: Record<string, string> = {};
  const effective: string[] = [];

  // Defense-in-depth: filtrér allowed-list gennem CUSTOMER_TOOL_ALLOWLIST.
  // Hvis admin har gemt en tool i DB der senere blev fjernet fra customer-
  // allowlisten (template-opdatering), så ekskluderes den her i stedet for
  // at boome ved registry-lookup.
  const customerSet = new Set<string>(CUSTOMER_TOOL_ALLOWLIST);

  for (const registryName of allowedToolNames) {
    if (!customerSet.has(registryName)) continue;
    const reg = getTool(registryName);
    if (!reg) continue;

    const apiName = registryName.replace(/\./g, "_");
    // Cast nødvendigt: zod-to-json-schema's type-signatur er bundet til zod
    // v3-ZodType, mens vores registry bruger zod v4. Runtime-virker fint —
    // samme pattern bruges i lib/tools/registry.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = zodToJsonSchema(reg.input as any, {
      $refStrategy: "none",
      target: "openApi3",
    });
    // zodToJsonSchema returnerer { $schema, ...properties }. Gemini accepterer
    // ikke top-level $schema-felt, så vi strippe det.
    const { $schema: _drop, ...parameters } = schema as Record<string, unknown>;
    void _drop;

    declarations.push({
      name: apiName,
      description: reg.description,
      parameters,
    });
    nameMap[apiName] = registryName;
    effective.push(registryName);
  }

  return {
    geminiTools: [{ functionDeclarations: declarations }],
    nameMap,
    effectiveTools: effective,
  };
}

/**
 * Inverse-lookup brugt af /api/live/tool-dispatch når browseren POSTer et
 * tool-call: Gemini sender snake_case-navnet, vi skal slå tilbage til
 * registry's dot-format. Vi gemmer ikke nameMap'en mellem requests (token
 * er stateless), så dispatch genbygger den fra DB-allowedToolNames.
 */
export function registryNameFor(
  bundle: VoiceToolBundle,
  apiName: string,
): string | undefined {
  return bundle.nameMap[apiName];
}
