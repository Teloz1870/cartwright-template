import { expect, test } from "@playwright/test";

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
