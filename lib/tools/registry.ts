import "server-only";

import { zodInputJsonSchema, zodOutputJsonSchema } from "@/lib/zod-json-schema";
import { hasScope, type Scope } from "@/lib/scopes";
import type { AnyTool, ToolCtx, ToolDefinition } from "@/lib/tools/types";
// COMMERCE packs come through the B3 registry seam (lib/tools/packs/
// commerce.ts) — webshop provides the real packs; the static variant
// (commerce.static.ts) empties them for managed-site materializations.
// Spread positions in ALL_TOOLS below are unchanged, so the shipped
// tool list / manifest order is byte-identical.
import {
  productsTools,
  ordersTools,
  discountsTools,
  categoriesTools,
  customerTools,
  addressTools,
  subscriptionsTools,
  analyticsTools,
  marketingTools,
  uiTools,
  scraperTools,
} from "@/lib/tools/packs/commerce";
import { servicesTools } from "@/lib/tools/services";
import { pagesTools } from "@/lib/tools/pages";
import { postsTools } from "@/lib/tools/posts";
import { settingsTools } from "@/lib/tools/settings";
import { featuresTools } from "@/lib/tools/features";
import { threeDTools } from "@/lib/tools/three-d";
import { genomeTools } from "@/lib/tools/genome";
import { auditTools } from "@/lib/tools/audit";
import { imagesTools } from "@/lib/tools/images";
import { designTools } from "@/lib/tools/design";
import { gdprTools } from "@/lib/tools/gdpr";
import { googleTools } from "@/lib/tools/google";
import { sheetsTools } from "@/lib/tools/sheets";
import { driveTools } from "@/lib/tools/drive";
import { docsTools } from "@/lib/tools/docs";
import { magicTools } from "@/lib/tools/magic";
import { composeTools } from "@/lib/tools/compose";
import { mockupTools } from "@/lib/tools/mockup";
import { importTools } from "@/lib/tools/import";
import { sitepackTools } from "@/lib/tools/sitepack";
import { siteTools } from "@/lib/tools/site";

/**
 * Tool-registry: alle tools fra alle domæner registreres her og bliver
 * tilgængelige via `getTool(name)` / `invokeTool(name, args, ctx, granted)`.
 *
 * Semantisk søgning er nu indbygget i `products.search` (hybrid vektor-cosine +
 * leksikalsk, se lib/search/). Embeddings genereres via `googleGeminiApiKey`
 * (lokal Ollama som fallback) og backfilles med `pnpm embeddings:backfill`.
 */
const ALL_TOOLS: readonly AnyTool[] = [
  ...(productsTools as AnyTool[]),
  ...(servicesTools as AnyTool[]),
  ...(ordersTools as AnyTool[]),
  ...(discountsTools as AnyTool[]),
  ...(categoriesTools as AnyTool[]),
  ...(pagesTools as AnyTool[]),
  ...(siteTools as AnyTool[]),
  ...(postsTools as AnyTool[]),
  ...(settingsTools as AnyTool[]),
  ...(featuresTools as AnyTool[]),
  ...(threeDTools as AnyTool[]),
  ...(genomeTools as AnyTool[]),
  ...(analyticsTools as AnyTool[]),
  ...(marketingTools as AnyTool[]),
  ...(auditTools as AnyTool[]),
  ...(customerTools as AnyTool[]),
  ...(addressTools as AnyTool[]),
  ...(imagesTools as AnyTool[]),
  ...(scraperTools as AnyTool[]),
  ...(designTools as AnyTool[]),
  ...(gdprTools as AnyTool[]),
  ...(googleTools as AnyTool[]),
  ...(sheetsTools as AnyTool[]),
  ...(driveTools as AnyTool[]),
  ...(subscriptionsTools as AnyTool[]),
  ...(docsTools as AnyTool[]),
  ...(uiTools as AnyTool[]),
  ...(magicTools as AnyTool[]),
  ...(composeTools as AnyTool[]),
  ...(mockupTools as AnyTool[]),
  ...(importTools as AnyTool[]),
  ...(sitepackTools as AnyTool[]),
];

// Indekser ved navn for O(1) lookup. Fail-fast hvis duplikerede navne
// nogensinde slipper igennem.
const TOOL_INDEX = new Map<string, AnyTool>();
for (const tool of ALL_TOOLS) {
  if (TOOL_INDEX.has(tool.name)) {
    throw new Error(`Duplicate tool name in registry: ${tool.name}`);
  }
  TOOL_INDEX.set(tool.name, tool);
}

export function listTools(): readonly AnyTool[] {
  return ALL_TOOLS;
}

export function getTool(name: string): AnyTool | undefined {
  return TOOL_INDEX.get(name);
}

/**
 * Offentlig manifest til /api/mcp/public-tools — viser tool-navne, scope,
 * beskrivelse og input-schema (uden faktisk eksekverbar handler). Bruges
 * af journalist/dev-introspection og af MCP-clients der vil opdage tools.
 */
export type ToolManifest = {
  name: string;
  description: string;
  scope: Scope;
  revertible: boolean;
  inputJsonSchema: unknown; // Zod -> JSON Schema lazy-converted (TODO Fase 1a)
  outputJsonSchema?: unknown;
  examples?: { name: string; body: unknown }[];
};

export function buildToolManifest(): ToolManifest[] {
  return ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    scope: tool.scope,
    revertible: tool.revertible ?? false,
    // Convert the Zod input schema to JSON Schema so agents/MCP clients can
    // discover each tool's args without reading our TypeScript. Uses Zod v4's
    // native z.toJSONSchema (see lib/zod-json-schema) — the old
    // zod-to-json-schema@3 silently returned an empty {} for v4 schemas.
    inputJsonSchema: zodInputJsonSchema(tool.input),
    outputJsonSchema: tool.output ? zodOutputJsonSchema(tool.output) : undefined,
    examples: tool.examples,
  }));
}

/**
 * Den centrale dispatcher: kald et tool ved navn med args + caller-context.
 *
 * Den ENESTE sti hvor scope-tjek finder sted (security-kritisk: hvis denne
 * funktion ikke kører, må intet tool-kald slippe igennem). Storefront-chat
 * skal kalde `invokeTool` med `granted: CUSTOMER_CHAT_SCOPES`; REST/MCP
 * skal videregive scopes fra deres validated API-key.
 *
 * Returnerer:
 *  - `{ ok: true, result }` ved success
 *  - `{ ok: false, status: 404 }` hvis tool ikke findes
 *  - `{ ok: false, status: 403 }` hvis granted scopes ikke dækker tool.scope
 *  - `{ ok: false, status: 422 }` hvis Zod-validering fejler (inkl. fejl-detaljer)
 *  - `{ ok: false, status: 500 }` hvis handler kaster (inkl. fejl-besked)
 */
export type InvokeResult =
  | { ok: true; result: unknown }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 403; error: string }
  | { ok: false; status: 422; error: string; issues?: unknown }
  | { ok: false; status: 500; error: string };

export async function invokeTool(
  name: string,
  args: unknown,
  ctx: ToolCtx,
  granted: readonly Scope[],
): Promise<InvokeResult> {
  const tool = TOOL_INDEX.get(name) as ToolDefinition<unknown, unknown> | undefined;
  if (!tool) {
    return { ok: false, status: 404, error: `Tool not found: ${name}` };
  }

  if (!hasScope(granted, tool.scope)) {
    return {
      ok: false,
      status: 403,
      error: `Tool '${name}' requires scope: ${tool.scope}`,
    };
  }

  const parsed = tool.input.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
      issues: parsed.error.issues,
    };
  }

  try {
    const result = await tool.handler(parsed.data, ctx);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
