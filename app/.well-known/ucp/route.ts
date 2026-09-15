import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brand";
import { SCOPE_POLICIES, SUPPORTED_SCOPES } from "@/lib/ucp/oauth";

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

  const capabilities: Array<Record<string, unknown>> = [];
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
  // Google UCP native_commerce (marts 2026): annoncér at kataloget er native-
  // buyable af agenter — kun når shoppen reelt har agentic checkout (ACP) OG
  // eksponerer Merchant-feedet der bærer g:native_commerce-attributten.
  if (features.acp && features.merchantFeed) {
    capabilities.push({
      type: "native_commerce",
      description: "Catalog products are natively buyable by agents (Google UCP native_commerce)",
      feed: "/feed/google.xml",
      protocol: "Universal Commerce Protocol (UCP)",
    });
  }
  // UCP dev.ucp.common.identity_linking (OAuth 2.0 Authorization-Code + PKCE).
  // Annonceres KUN når flaget er on OG OAuth-serveren er bygget — den er det nu
  // (lib/ucp/oauth.ts + /oauth/* + /.well-known/oauth-authorization-server).
  if (features.ucpIdentityLinking) {
    capabilities.push({
      type: "identity_linking",
      capability: "dev.ucp.common.identity_linking",
      description:
        "Agent account-linking via OAuth 2.0 Authorization Code + PKCE (act on a user's behalf across merchants)",
      authorizationServerMetadata: "/.well-known/oauth-authorization-server",
      protocol: "Universal Commerce Protocol (UCP)",
      // Spec-formet config.scopes — erklærer at disse operationer kræver et
      // bruger-identitets-token (dev.ucp.common.identity_linking).
      config: {
        scopes: Object.fromEntries(
          SUPPORTED_SCOPES.map((s) => [s, { description: SCOPE_POLICIES[s] ?? { plain: s } }]),
        ),
      },
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
