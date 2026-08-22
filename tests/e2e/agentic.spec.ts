import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

test("raw homepage is meaningful and markdown negotiation is cache-safe", async ({ request }) => {
  const html = await request.get("/da", { headers: { "user-agent": "ClaudeBot" } });
  expect(html.status()).toBe(200);
  expect(await html.text()).toMatch(/<h1[\s>]/i);

  const markdown = await request.get("/da", { headers: { accept: "text/markdown" } });
  expect(markdown.status()).toBe(200);
  expect(markdown.headers()["content-type"]).toContain("text/markdown");
  expect(markdown.headers().vary.toLowerCase()).toContain("accept");
  expect(await markdown.text()).toContain("## When to use this site");
});

test("OpenAPI and anonymous REST expose only the documented public contract", async ({ request }) => {
  const openapi = await request.get("/openapi.json");
  expect(openapi.status()).toBe(200);
  const contract = await openapi.json();
  expect(contract.openapi).toBe("3.1.0");
  expect(contract.paths["/api/v1/tools/products.search"].post.security).toEqual([]);
  expect(contract.paths["/api/v1/tools/orders.list"].post.security).toEqual([{ bearerAuth: [] }]);

  const publicRead = await request.post("/api/v1/tools/site.list_pages", { data: { locale: "en" } });
  expect(publicRead.status()).toBe(200);
  expect(publicRead.headers()["ratelimit-limit"]).toBeTruthy();

  const privateRead = await request.post("/api/v1/tools/orders.list", { data: {} });
  expect(privateRead.status()).toBe(401);
  expect(privateRead.headers()["content-type"]).toContain("application/problem+json");
});

test("anonymous MCP initializes and unknown markdown paths recover with 404", async ({ request }) => {
  const mcp = await request.post("/api/mcp", {
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-03-26",
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "playwright", version: "1" } },
    },
  });
  expect(mcp.status()).toBe(200);
  expect((await mcp.json()).result.serverInfo.name).toBeTruthy();

  const missing = await request.get("/en/this-path-does-not-exist", { headers: { accept: "text/markdown" } });
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("text/markdown");
  expect(await missing.text()).toContain("[Sitemap](/sitemap.xml)");
});

test("well-known API and Agent Skills discovery are truthful and verifiable", async ({ request }) => {
  const [catalogResponse, indexResponse, skillResponse] = await Promise.all([
    request.get("/.well-known/api-catalog"),
    request.get("/.well-known/agent-skills/index.json"),
    request.get("/.well-known/agent-skills/public-site-research/SKILL.md"),
  ]);

  expect(catalogResponse.status()).toBe(200);
  expect(catalogResponse.headers()["content-type"]).toContain("application/linkset+json");
  expect(catalogResponse.headers().link).toContain('rel="api-catalog"');
  expect(catalogResponse.headers().link).toContain('rel="agent-skills"');
  const catalog = await catalogResponse.json();
  expect(catalog.linkset[0]["service-desc"][0].href).toMatch(/\/openapi\.json$/);
  expect(catalog.linkset[0]["agent-skills"][0].href).toMatch(/\/agent-skills\/index\.json$/);

  expect(indexResponse.status()).toBe(200);
  expect(skillResponse.status()).toBe(200);
  expect(skillResponse.headers()["content-type"]).toContain("text/markdown");
  const index = await indexResponse.json();
  const skill = await skillResponse.text();
  expect(index.$schema).toContain("schemas.agentskills.io/discovery/0.2.0/schema.json");
  expect(index.skills[0].name).toBe("public-site-research");
  expect(index.skills[0].digest).toBe(
    `sha256:${createHash("sha256").update(skill, "utf8").digest("hex")}`,
  );
  expect(skill).toContain("## Safety and authority");
});
