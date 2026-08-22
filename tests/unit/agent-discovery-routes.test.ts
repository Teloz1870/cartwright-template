import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  features: { mcpPublic: true } as { mcpPublic?: boolean },
  brand: {
    storeName: "Example Shop",
    storeSlug: "example-shop",
    url: "https://shop.example",
    defaultLocale: "en",
    ecommerceEnabled: true,
    features: { mcpPublic: true, acp: false },
  },
}));

vi.mock("@/lib/brand", () => ({
  getFeatures: async () => mocks.features,
  getBrand: async () => mocks.brand,
}));

import * as apiCatalogRoute from "@/app/.well-known/api-catalog/route";
import * as skillIndexRoute from "@/app/.well-known/agent-skills/index.json/route";
import * as skillRoute from "@/app/.well-known/agent-skills/public-site-research/SKILL.md/route";

beforeEach(() => {
  mocks.features = { mcpPublic: true };
  mocks.brand.storeName = "Example Shop";
  mocks.brand.url = "https://shop.example";
  mocks.brand.defaultLocale = "en";
  mocks.brand.ecommerceEnabled = true;
  mocks.brand.features = { mcpPublic: true, acp: false };
});

describe("RFC 9727 API catalog", () => {
  it("publishes runtime-resolved OpenAPI and developer links", async () => {
    const response = await apiCatalogRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/linkset+json");
    expect(response.headers.get("content-type")).toContain("rfc9727");
    expect(response.headers.get("link")).toContain('rel="api-catalog"');
    expect(response.headers.get("link")).toContain('rel="service-desc"');
    expect(response.headers.get("link")).toContain('rel="agent-skills"');
    expect(body).toEqual({
      linkset: [
        {
          anchor: "https://shop.example/api/v1/tools",
          "service-desc": [
            {
              href: "https://shop.example/openapi.json",
              type: "application/vnd.oai.openapi+json",
            },
          ],
          "service-doc": [
            {
              href: "https://shop.example/en/developers",
              type: "text/html",
            },
          ],
          "agent-skills": [
            {
              href: "https://shop.example/.well-known/agent-skills/index.json",
              type: "application/json",
            },
          ],
        },
      ],
    });
  });
});

describe("Agent Skills discovery", () => {
  it("publishes a conformant index whose digest matches the served SKILL.md", async () => {
    const [indexResponse, skillResponse] = await Promise.all([
      skillIndexRoute.GET(),
      skillRoute.GET(),
    ]);
    const index = await indexResponse.json();
    const skill = await skillResponse.text();
    const entry = index.skills[0];

    expect(index.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    expect(entry).toMatchObject({
      name: "public-site-research",
      type: "skill-md",
      url: "https://shop.example/.well-known/agent-skills/public-site-research/SKILL.md",
    });
    expect(entry.description.length).toBeGreaterThan(80);
    expect(entry.digest).toBe(`sha256:${createHash("sha256").update(skill, "utf8").digest("hex")}`);
    expect(skillResponse.headers.get("content-type")).toContain("text/markdown");
    expect(indexResponse.headers.get("cache-control")).toBe("no-store");
    expect(skillResponse.headers.get("cache-control")).toBe("no-store");
    expect(skill).toContain("name: public-site-research");
    expect(skill).toContain("## Anonymous tools");
    expect(skill).toContain("products.search");
    expect(skill).toContain("site.get_page");
    expect(skill).toContain("normal web interface");
    expect(skill).toContain("valid scoped Bearer API key");
  });

  it("does not advertise agent checkout when ACP is disabled", async () => {
    const skill = await (await skillRoute.GET()).text();
    expect(skill).not.toContain("enabled ACP flow");
    expect(skill).toContain("does not advertise an agent checkout protocol");
  });
});

describe("public discovery gate", () => {
  it("returns the shared 404 contract for every discovery route when MCP is disabled", async () => {
    mocks.features = { mcpPublic: false };
    const responses = await Promise.all([
      apiCatalogRoute.GET(),
      skillIndexRoute.GET(),
      skillRoute.GET(),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    await Promise.all(responses.map(async (response) => {
      expect(await response.json()).toEqual({ error: "not_found" });
    }));
  });
});
