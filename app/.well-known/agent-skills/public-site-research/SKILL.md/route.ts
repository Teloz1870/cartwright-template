import { getBrand } from "@/lib/brand";
import { buildPublicSiteSkill } from "@/lib/agent-skills/public-site";
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
  return new Response(buildPublicSiteSkill(brand), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      // The index hashes these exact bytes. Independent CDN TTLs could serve
      // an old index beside a newly branded skill, so the integrity pair must
      // always revalidate together.
      "Cache-Control": "no-store",
      "Vary": "Accept, Accept-Encoding",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse();
  if (gated) return gated;
  return mcpPublicOptionsResponse(ALLOWED_METHODS);
}
