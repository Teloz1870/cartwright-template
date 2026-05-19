import "server-only";

import type { z } from "zod";
import type { Scope } from "@/lib/scopes";
import type { AuditActor } from "@/lib/audit";

/**
 * En `Tool` er én atomisk, typed handler som AI kan kalde — uafhængigt af
 * exposure surface (REST, MCP, in-process). Tool-definitioner registreres
 * i `lib/tools/registry.ts` og kaldes af alle tre exposure surfaces via
 * `invokeTool(name, args, ctx)`.
 *
 * **Designprincip:** tools wrapper kun ren forretningslogik fra `lib/*.ts`;
 * Zod-validering + audit + scope er det ENESTE tools tilføjer ovenpå.
 */
export type ToolCtx = {
  actor: AuditActor;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
  /**
   * Cookies fra incoming request. Brugt af customer-tools til at læse
   * fx last_shipping (krypteret cookie sat efter ordre med rememberAddress).
   * Populeres af /api/assistant/chat — andre exposure surfaces lader den
   * være undefined (tools skal håndtere det gracefully).
   */
  cookies?: ReadonlyMap<string, string>;
  /**
   * Auth.js session-user-id, hvis kunden er logget ind. Brugt af tools der
   * skal hente User-specifik data (fx user.get_last_shipping → User.shipping*).
   */
  userId?: string | null;
};

export type ToolDefinition<TInput, TOutput> = {
  /** Kanonisk navn: "<domæne>.<verb>" — fx "products.create". Unikt. */
  name: string;
  /** Menneske-læseligt resumé. Vises i MCP-introspection + /api/mcp/public-tools. */
  description: string;
  /** Required scope for at kalde tool'et. */
  scope: Scope;
  /** Zod-schema der validerer input-args. */
  input: z.ZodType<TInput>;
  /** Implementation. Modtager validated input + audit-context. */
  handler: (args: TInput, ctx: ToolCtx) => Promise<TOutput>;
  /**
   * Hvis true: destruktive tool — kræver eksplicit `confirm: true` argument
   * i input, før-tilstand snapshottes til audit, og audit.revert kan rulle
   * det tilbage. (Kun set på *.delete + bulk-tools p.t.)
   */
  revertible?: boolean;
  /**
   * Hvis true: handler logger ikke args til audit (bruges til read-only tools
   * der ikke skal støje audit-loggen). Default: false.
   */
  skipAudit?: boolean;
};

/**
 * Convenience-helper: vi bruger en factory-funktion fordi TypeScript ikke
 * kan inferere generics fra et nøgen-objekt der har handler-callback.
 *
 *   export const createProduct = defineTool({
 *     name: "products.create",
 *     scope: "products:write",
 *     description: "Opret nyt produkt",
 *     input: productSchema,
 *     handler: async (args, ctx) => { ... },
 *   });
 */
export function defineTool<TInput, TOutput>(
  def: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return def;
}

/**
 * Bredere alias bruges af registry og REST/MCP-dispatcher. TInput/TOutput
 * er unknown her fordi vi tager imod tools af alle slags.
 */
export type AnyTool = ToolDefinition<unknown, unknown>;
