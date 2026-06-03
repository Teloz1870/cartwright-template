import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brand";

/**
 * Universal Commerce Protocol (UCP) Capability Profile
 * Declares the shop's Agentic Commerce capabilities to Google Gemini, OpenAI, etc.
 *
 * Capabilities reflekterer RESOLVED feature-state (getBrand) — vi annoncerer
 * kun en capability hvis dens feature faktisk er aktiveret, så agenter ikke
 * lover noget shoppen ikke understøtter.
 */
export async function GET() {
  // getBrand() merger allerede DB-overrides (storeName/domain) og har intern
  // fail-soft fallback — så vi undgår en separat uncaught BrandingSettings-query.
  const brand = await getBrand();

  const shopName = brand.storeName;
  const domain = brand.domain || "localhost:3000"; // Should ideally be dynamic based on request URL
  const currency = brand.policies.currency;
  const country = brand.policies.country;
  const features = brand.features;

  const capabilities: Array<Record<string, string>> = [];
  if (features.mcpPublic) {
    capabilities.push({
      type: "catalog_discovery",
      description: "Machine-readable catalog via MCP and JSON-LD",
      endpoint: "/api/mcp",
      protocol: "Model Context Protocol (MCP)",
    });
  }
  if (features.acp) {
    capabilities.push({
      type: "conversational_checkout",
      description: "Supports ACP-style REST endpoints for agent-driven cart creation and negotiation",
      endpointPrefix: "/api/v1/checkout",
      authentication: "Shared Payment Tokens",
    });
  }

  const ucpProfile = {
    $schema: "https://universalcommerceprotocol.org/schema/v1/capability-profile.json",
    merchant: {
      name: shopName,
      domain: domain,
      baseCurrency: currency,
      supportedLocales: [country],
    },
    capabilities,
    governance: {
      agent_negotiation: Boolean(features.a2a),
      requires_human_override_on_payment: true,
      trust_framework: "Cartwright Agentic Commerce V1",
    },
    resources: {
      llms_txt: "/llms.txt",
      sitemap: "/sitemap.xml",
    },
  };

  return NextResponse.json(ucpProfile, {
    headers: {
      "Cache-Control": "s-maxage=86400, stale-while-revalidate",
    },
  });
}
