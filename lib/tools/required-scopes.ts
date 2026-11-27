import { hasScope, type Scope } from "@/lib/scopes";

/**
 * The scope fields of a tool, and nothing else — so a caller that only has a
 * manifest entry or a test double can ask the same questions as the registry.
 */
export type ToolScopes = {
  scope: Scope;
  extraScopes?: readonly Scope[];
};

/**
 * Every scope a key needs to call this tool: the primary `scope` first, then
 * each `extraScopes` entry. A tool that writes into another domain's data —
 * `marketing.create_campaign` issues a discount code — names that domain's
 * write scope here, so it is never a way round the scope that guards it.
 */
export function requiredScopes(tool: ToolScopes): Scope[] {
  return [tool.scope, ...(tool.extraScopes ?? [])];
}

/**
 * Whether a key needs `scope` to call this tool — as its primary `scope` or as
 * one of its `extraScopes`. This is what `GET /api/v1/tools?scope=` filters on,
 * so `?scope=discounts:write` lists `marketing.create_campaign` beside
 * `discounts.create`. It takes a plain string because the filter is a query
 * parameter; an unknown scope simply matches nothing.
 */
export function requiresScope(tool: ToolScopes, scope: string): boolean {
  return requiredScopes(tool).some((required) => required === scope);
}

/** The first required scope `granted` does not cover, or null when it covers all. */
export function missingToolScope(granted: readonly string[], tool: ToolScopes): Scope | null {
  return requiredScopes(tool).find((scope) => !hasScope(granted, scope)) ?? null;
}

/** Whether `granted` covers every scope the tool needs. */
export function hasToolScopes(granted: readonly string[], tool: ToolScopes): boolean {
  return missingToolScope(granted, tool) === null;
}

/**
 * The `extraScopes` a published document carries for this tool: absent when
 * the tool has none, so every other tool's entry keeps exactly the keys it had.
 */
export function publishedExtraScopes(tool: ToolScopes): { extraScopes?: Scope[] } {
  return tool.extraScopes?.length ? { extraScopes: [...tool.extraScopes] } : {};
}
