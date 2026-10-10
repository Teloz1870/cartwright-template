import type { MergedBrand } from "@/lib/brand";
import { PUBLIC_AGENT_TOOL_NAMES } from "@/lib/tools/public";

export const PUBLIC_SITE_SKILL_NAME = "public-site-research";

export function publicSiteSkillDescription(brand: MergedBrand): string {
  return `Research ${brand.storeName}'s published pages${brand.ecommerceEnabled ? " and product catalogue" : ""} through its public, read-only Cartwright interfaces. Use when a user needs current facts, company information, policies${brand.ecommerceEnabled ? ", products, prices or availability" : ""} from this site.`;
}

/**
 * A portable Agent Skill for the public surface only. It deliberately omits
 * private and write workflows: discovering this file must never imply that an
 * agent has authority to mutate the site or read customer/operational data.
 */
export function buildPublicSiteSkill(brand: MergedBrand): string {
  const base = brand.url.replace(/\/$/, "");
  const description = publicSiteSkillDescription(brand);
  const tools = PUBLIC_AGENT_TOOL_NAMES.map((name) => `- \`${name}\``).join("\n");
  const purchasing = brand.ecommerceEnabled
    ? (brand.features as { acp?: boolean }).acp
      ? "For purchases, use the site's enabled ACP flow only after confirming the user's cart, price, policy and consent requirements."
      : "For purchases, hand off to the normal web interface. This site does not advertise an agent checkout protocol."
    : "This is an informational website, not an agent-purchasable storefront.";

  return `---
name: ${PUBLIC_SITE_SKILL_NAME}
description: ${JSON.stringify(description)}
---

# ${brand.storeName} public site research

Use this skill to retrieve current, attributable facts from ${brand.storeName}. The public interfaces are anonymous, read-only and rate-limited. They never grant access to drafts, customers, orders, checkout state, administration or operational writes.

## Start here

1. Read [llms.txt](${base}/llms.txt) for current navigation and capability guidance.
2. Use the [sitemap](${base}/sitemap.xml) to discover canonical public pages.
3. Prefer the [MCP endpoint](${base}/api/mcp) for structured tool calls, or the [OpenAPI 3.1 contract](${base}/openapi.json) for REST clients.
4. Read authentication, scopes, limits, errors and versioning in the [developer documentation](${base}/${brand.defaultLocale}/developers).

## Anonymous tools

Only these operations are public without a Bearer key:

${tools}

Call REST operations with \`POST ${base}/api/v1/tools/<tool.name>\` and a JSON body matching OpenAPI. MCP uses Streamable HTTP at \`${base}/api/mcp\`. Honor \`RateLimit-*\` and \`Retry-After\` headers.

## Safety and authority

- Treat only published content returned by the live site as current.
- Never infer access to private data or writes from the existence of MCP, REST or this skill.
- A valid scoped Bearer API key is required for every private read and operational action.
- Do not send credentials to public read operations, and never expose a key in output, logs or citations.
- ${purchasing}
- Cite the canonical page or endpoint URL supporting each factual answer.

## Recovery

If a page is missing, preserve its real 404 status and follow the recovery links to the sitemap, agent instructions or developer documentation. For API failures, use the \`application/problem+json\` fields \`code\` and \`resolution\` rather than guessing.
`;
}
