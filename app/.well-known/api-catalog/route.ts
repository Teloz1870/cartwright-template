import { getBrand } from "@/lib/brand";
import {
  mcpPublicDisabledResponse,
  mcpPublicOptionsResponse,
} from "@/lib/tools/public-gate";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

export async function GET(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;

  const brand = await getBrand();
  const base = brand.url.replace(/\/$/, "");
  const catalogUrl = `${base}/.well-known/api-catalog`;
  const apiUrl = `${base}/api/v1/tools`;
  const openApiUrl = `${base}/openapi.json`;
  const developerUrl = `${base}/${brand.defaultLocale}/developers`;
  const agentSkillsUrl = `${base}/.well-known/agent-skills/index.json`;
  const body = {
    linkset: [
      {
        anchor: apiUrl,
        "service-desc": [
          { href: openApiUrl, type: "application/vnd.oai.openapi+json" },
        ],
        "service-doc": [
          { href: developerUrl, type: "text/html" },
        ],
        "agent-skills": [
          { href: agentSkillsUrl, type: "application/json" },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8',
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Link": `<${catalogUrl}>; rel="api-catalog", <${apiUrl}>; rel="item", <${openApiUrl}>; rel="service-desc"; type="application/vnd.oai.openapi+json", <${developerUrl}>; rel="service-doc"; type="text/html", <${agentSkillsUrl}>; rel="agent-skills"; type="application/json"`,
      "Vary": "Accept, Accept-Encoding",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;
  return mcpPublicOptionsResponse(ALLOWED_METHODS);
}
