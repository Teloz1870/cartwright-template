import "server-only";

import { zodToJsonSchema } from "zod-to-json-schema";
import { hasScope, type Scope } from "@/lib/scopes";
import type { AnyTool, ToolCtx, ToolDefinition } from "@/lib/tools/types";
import { productsTools } from "@/lib/tools/products";
import { ordersTools } from "@/lib/tools/orders";
import { discountsTools } from "@/lib/tools/discounts";
import { categoriesTools } from "@/lib/tools/categories";
import { pagesTools } from "@/lib/tools/pages";
import { settingsTools } from "@/lib/tools/settings";
import { analyticsTools } from "@/lib/tools/analytics";
import { marketingTools } from "@/lib/tools/marketing";
import { auditTools } from "@/lib/tools/audit";
import { customerTools } from "@/lib/tools/customer";
import { addressTools } from "@/lib/tools/address";
import { imagesTools } from "@/lib/tools/images";

/**
 * Tool-registry: alle tools fra alle domæner registreres her og bliver
 * tilgængelige via `getTool(name)` / `invokeTool(name, args, ctx, granted)`.
 *
 * Catalog.recommend (semantic search via embeddings) kan komme senere — for
 * 24 produkter er fritekst-search via products.search + AI-reasoning rigeligt.
 */
const ALL_TOOLS: readonly AnyTool[] = [
  ...(productsTools as AnyTool[]),
  ...(ordersTools as AnyTool[]),
  ...(discountsTools as AnyTool[]),
  ...(categoriesTools as AnyTool[]),
  ...(pagesTools as AnyTool[]),
  ...(settingsTools as AnyTool[]),
  ...(analyticsTools as AnyTool[]),
  ...(marketingTools as AnyTool[]),
  ...(auditTools as AnyTool[]),
  ...(customerTools as AnyTool[]),
  ...(addressTools as AnyTool[]),
  ...(imagesTools as AnyTool[]),
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
};

export function buildToolManifest(): ToolManifest[] {
  return ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    scope: tool.scope,
    revertible: tool.revertible ?? false,
    // Konverter Zod-schema til JSON Schema så journalister/dev-klienter kan
    // se hvilke args et tool tager uden at læse vores TypeScript-kildekode.
    // Cast nødvendigt fordi zod-to-json-schema's type-signatur er bundet til
    // Zod v3 mens vi er på v4 — runtime virker fint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputJsonSchema: zodToJsonSchema(tool.input as any, {
      name: tool.name,
      $refStrategy: "none",
    }),
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
