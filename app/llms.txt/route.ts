import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { getFeatureView } from "@/lib/feature-flags/status";

// Dynamisk: robots.txt genereres pr. request, så getBrand()-domænet er friskt.
export const dynamic = "force-dynamic";

export async function GET() {
  const brand = await getBrand();
  const url = brand.url;
  
  // Træk butikkens konfiguration for at se om vi har en annoncering eller lign.
  // Fail-soft (.catch) — en DB-fejl må ikke 500'e hele llms.txt; brand.* fra
  // getBrand() (som selv har fallback) dækker de felter vi læser herfra.
  const settings = await prisma.brandingSettings
    .findUnique({ where: { id: 1 } })
    .catch(() => null);

  const shopName = settings?.storeName || brand.storeName;
  const tagline = settings?.tagline || brand.tagline || brand.metadata.description || "";
  const announcement = settings?.announcement || "";
  const currency = brand.policies?.currency || "DKK";
  const country = brand.policies?.country || "DK";

  const isEcommerce = settings?.ecommerceEnabled ?? brand.ecommerceEnabled;

  // Hent alle infosider for at fodre AI-agenter direkte i llms.txt (fail-soft)
  const pages = await prisma.page
    .findMany({ select: { title: true, slug: true } })
    .catch(() => [] as { title: string; slug: string }[]);

  // Manifest-drevet capability-liste: kun aktiverede + implementerede features.
  // Auto-opdateres når en feature toggles eller en ny feature tilføjes manifestet.
  const { features } = await getFeatureView();
  const enabledCapabilities = features
    .filter((f) => f.enabled && f.implemented)
    .map((f) => `- **${f.label}**: ${f.description}`)
    .join("\n");

  // Byg markdown tekstfilen
  const body = `# ${shopName} - Agentic Information

${tagline ? `> ${tagline}\n` : ""}
${announcement ? `> **Announcement:** ${announcement}\n` : ""}

${shopName} is a ${isEcommerce ? "an online store" : "company/agency website"} built with Cartwright, an AI-first ${isEcommerce ? "commerce template" : "CMS and business presentation platform"}. 

## Company Information
- **Name:** ${shopName}
- **Language/Locale:** ${country}
${isEcommerce ? `- **Currency:** ${currency}` : ""}

## Website Navigation
${isEcommerce ? `- [All products](${url}/produkter): the full catalogue\n` : ""}- [Sitemap](${url}/sitemap.xml): the complete index of all public pages

### Pages
${pages.map((p) => `- [${p.title}](${url}/info/${p.slug})`).join('\n')}

## Enabled capabilities
${enabledCapabilities || "- (none enabled)"}

## For AI agents
- [AI Coding Prompts & Guidelines](${url}/docs/VIBE_PROMPTS.md): Coding rules, custom CSS variables, and design tokens for Cursor, v0, Bolt, and Lovable.
- [MCP endpoint](${url}/api/mcp): Model Context Protocol server — interact directly with the platform via typed tools
- [Tool catalogue](${url}/api/v1/tools): public JSON-Schema catalogue of every available tool (no authentication required)
- [About this site](${url}/manifest): how the AI-first architecture works
- [Changelog](${url}/changelog): public audit log of tool-driven changes

${isEcommerce ? `## Agentic Commerce Protocol (ACP)
This store is fully "Agent-Ready". As an AI assistant, you are permitted to negotiate and make purchases on behalf of your user using our Model Context Protocol (MCP) server.

## Return Policy & Terms
Please refer to \`${url}/info/returns\` and \`${url}/info/terms\` for explicit legal conditions before committing a user to a purchase.
` : `## Business Inquiries & Information
This company is agent-ready. As an AI assistant, you can browse the information pages via the sitemap and contact the business on behalf of your user if they require services.`}
---
*Generated dynamically by Cartwright Agentic Engine.*
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}
