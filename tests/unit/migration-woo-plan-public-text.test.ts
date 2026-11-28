import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { ADMIN_TOOL_ALLOWLIST, filterToolsForCapability } from "@/lib/ai/admin-tools";
import { publicAgentPerIpLimiter } from "@/lib/public-agent-rate-limit";
import { publicAgentTools } from "@/lib/tools/public";
import { getTool, invokeTool, listTools } from "@/lib/tools/registry";

/**
 * W21-live-2a-1b, review round 1: what of migration.woo_plan reaches past its flag.
 *
 * `migrationDashboard` refuses the CALL. It does not hold back the TEXT: the registry lists every tool
 * whatever its flag says, so a shop with the webshop module serves this description with the flag off,
 * and rewriting it changes what a canary serves. "Default-off, so the canaries are byte-identical" was
 * claimed for exactly such a rewrite, and it was false: demo.cartwright.app listed the old text to anyone.
 *
 * So this pins which surfaces carry the text, the ones the CHANGELOG entry names, and which do not. Move
 * one (filter the listing, make the tool public) and that entry moves with it. The routes, the MCP SDK
 * and the registry are real; the brand, the key lookup and the database are the only seams.
 */

const mocks = vi.hoisted(() => ({
  features: {} as Record<string, boolean>,
  scopes: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_, model) => { throw new Error(`no database read expected here, got prisma.${String(model)}`); } }),
}));
vi.mock("@/lib/brand", async (orig) => ({
  ...(await orig<typeof import("@/lib/brand")>()),
  getBrand: vi.fn(async () => ({
    url: "https://shop.example.test/",
    storeName: "Example Shop",
    storeSlug: "example-shop",
    ecommerceEnabled: true,
    defaultLocale: "en",
    metadata: { description: "An example shop." },
    features: {},
    company: {},
    contact: {},
  })),
  getFeatureGateState: vi.fn(async () => ({ available: true, features: { ...mocks.features } })),
}));
vi.mock("@/lib/api-auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-auth")>()),
  authenticateApiKey: vi.fn(async () => ({ actor: { type: "apikey", apiKeyId: "k-test", userId: "u-test", scopes: mocks.scopes } })),
}));

type Listed = { name: string; description: string; anonymous?: boolean; security?: string };

const NAME = "migration.woo_plan";
const request = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`https://shop.example.test${path}`, init);
const description = () => getTool(NAME)?.description;

async function catalogue(query = ""): Promise<{ status: number; tools: Listed[] }> {
  const { GET } = await import("@/app/api/v1/tools/route");
  const response = await GET(request(`/api/v1/tools${query}`));
  const body = (await response.json()) as { tools?: Listed[] };
  return { status: response.status, tools: body.tools ?? [] };
}

async function mcpToolsList(authorization?: string): Promise<Listed[]> {
  const { POST } = await import("@/app/api/mcp/route");
  const response = await POST(request("/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  }));
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: { tools: Listed[] } }).result.tools;
}

const named = (tools: readonly { name: string }[]) => tools.find((tool) => tool.name === NAME);

beforeEach(() => {
  mocks.features = { migrationDashboard: false, mcpPublic: true };
  mocks.scopes = ["settings:read"];
  publicAgentPerIpLimiter.reset();
});

describe("migration.woo_plan with migrationDashboard off: the flag refuses the call, not the text", () => {
  it("the call is refused, even with the scope it asks for", async () => {
    const refused = await invokeTool(NAME, {}, { actor: "apikey:test", requestId: "test-public-text" }, ["settings:read"]);
    expect(refused).toMatchObject({ ok: false, status: 500, error: expect.stringContaining("Migration dashboard is disabled") });
  });

  it("anyone reads the description in the tool catalogue, in every form, and is told a call needs a key", async () => {
    expect(description()).toBeTruthy();
    for (const query of ["", "?schema=true", "?scope=settings:read"]) {
      const { status, tools } = await catalogue(query);
      expect(status, query).toBe(200);
      expect(named(tools), query).toMatchObject({ description: description(), anonymous: false, security: "bearer" });
    }
    const { GET } = await import("@/app/api/v1/tools/[name]/route");
    const response = await GET(request(`/api/v1/tools/${NAME}`), { params: Promise.resolve({ name: NAME }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: NAME, description: description() });
  });

  it("the catalogue follows mcpPublic, and the OpenAPI document and its alias do not", async () => {
    mocks.features = { migrationDashboard: false, mcpPublic: false };
    expect((await catalogue()).status).toBe(404);
    const { GET: oneTool } = await import("@/app/api/v1/tools/[name]/route");
    expect((await oneTool(request(`/api/v1/tools/${NAME}`), { params: Promise.resolve({ name: NAME }) })).status).toBe(404);

    const routes = [await import("@/app/openapi.json/route"), await import("@/app/api/openapi.json/route")];
    for (const route of routes) {
      const response = await route.GET();
      expect(response.status).toBe(200);
      const { paths } = (await response.json()) as { paths: Record<string, { post: Record<string, unknown> }> };
      expect(paths[`/api/v1/tools/${NAME}`]?.post).toMatchObject({
        summary: description(),
        description: description(),
        security: [{ bearerAuth: [] }],
        "x-cartwright-anonymous-read": false,
      });
    }
  });

  it("a key with settings:read reads it in MCP tools/list; another key and an anonymous client do not see the tool", async () => {
    expect(named(await mcpToolsList("Bearer sb_live_test"))).toMatchObject({ description: description() });
    mocks.scopes = ["catalog:read"];
    expect(named(await mcpToolsList("Bearer sb_live_test"))).toBeUndefined();
    expect(named(await mcpToolsList())).toBeUndefined();
  });

  it("the admin chat offers it to the model with its description, and no flag decides that", () => {
    expect(filterToolsForCapability(ADMIN_TOOL_ALLOWLIST, { tools: "all" })).toContain(NAME);
    expect(readFileSync(join(process.cwd(), "app/api/admin/chat/route.ts"), "utf8")).toContain("description: reg.description");
  });

  it("the anonymous agent surface does not name it: the server card, and the list /developers renders", async () => {
    const { GET } = await import("@/app/.well-known/mcp.json/route");
    const card = (await (await GET()).json()) as { tools: Listed[] };
    expect(card.tools.length).toBeGreaterThan(0);
    expect(named(card.tools)).toBeUndefined();
    expect(named(publicAgentTools(listTools()))).toBeUndefined();
  });
});
