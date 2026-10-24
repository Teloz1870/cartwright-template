import "server-only";

import type { Scope } from "@/lib/scopes";
import type { AnyTool } from "@/lib/tools/types";

export const PUBLIC_AGENT_TOOL_NAMES = [
  "products.search",
  "products.get",
  "categories.list",
  "site.list_pages",
  "site.get_page",
] as const;

export type PublicAgentToolName = (typeof PUBLIC_AGENT_TOOL_NAMES)[number];

const PUBLIC_NAMES = new Set<string>(PUBLIC_AGENT_TOOL_NAMES);

export const PUBLIC_AGENT_SCOPES: readonly Scope[] = [
  "catalog:read",
  "categories:read",
  "pages:read",
];

export function isPublicAgentTool(name: string): name is PublicAgentToolName {
  return PUBLIC_NAMES.has(name);
}

export function publicAgentTools(tools: readonly AnyTool[]): readonly AnyTool[] {
  return tools.filter((tool) => isPublicAgentTool(tool.name));
}
