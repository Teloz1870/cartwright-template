import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";

/**
 * Universal Commerce Protocol (UCP) Capability Profile
 * Declares the shop's Agentic Commerce capabilities to Google Gemini, OpenAI, etc.
 */
export async function GET() {
  const settings = await prisma.brandingSettings.findUnique({
    where: { id: 1 },
  });

  const shopName = settings?.storeName || brand.storeName;
  const domain = settings?.domain || brand.domain || "localhost:3000"; // Should ideally be dynamic based on request URL
  const currency = brand.policies.currency;
  const country = brand.policies.country;

  const ucpProfile = {
    $schema: "https://universalcommerceprotocol.org/schema/v1/capability-profile.json",
    merchant: {
      name: shopName,
      domain: domain,
      baseCurrency: currency,
      supportedLocales: [country],
    },
    capabilities: [
      {
        type: "catalog_discovery",
        description: "Machine-readable catalog via MCP and JSON-LD",
        endpoint: "/api/mcp",
        protocol: "Model Context Protocol (MCP)",
      },
      {
        type: "conversational_checkout",
        description: "Supports ACP-style REST endpoints for agent-driven cart creation and negotiation",
        endpointPrefix: "/api/v1/checkout",
        authentication: "Shared Payment Tokens",
      },
    ],
    governance: {
      agent_negotiation: true,
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
