import { createHash } from "node:crypto";
import { getBrand } from "@/lib/brand";
import {
  buildPublicSiteSkill,
  PUBLIC_SITE_SKILL_NAME,
  publicSiteSkillDescription,
} from "@/lib/agent-skills/public-site";
import {
  mcpPublicDisabledResponse,
  mcpPublicOptionsResponse,
} from "@/lib/tools/public-gate";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

export async function GET(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse("/.well-known/agent-skills/index.json");
  if (gated) return gated;

  const brand = await getBrand();
  const skill = buildPublicSiteSkill(brand);
  const digest = createHash("sha256").update(skill, "utf8").digest("hex");
  const base = brand.url.replace(/\/$/, "");
  const body = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: PUBLIC_SITE_SKILL_NAME,
        type: "skill-md",
        description: publicSiteSkillDescription(brand),
        url: `${base}/.well-known/agent-skills/${PUBLIC_SITE_SKILL_NAME}/SKILL.md`,
        digest: `sha256:${digest}`,
      },
    ],
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      // Coupled to the SKILL.md byte digest; never let a CDN cache one side of
      // the integrity pair independently of the other.
      "Cache-Control": "no-store",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse("/.well-known/agent-skills/index.json");
  if (gated) return gated;
  return mcpPublicOptionsResponse(ALLOWED_METHODS);
}
