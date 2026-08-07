import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * mcpPublic-gaten på den offentlige tool-overflade: /api/mcp +
 * /api/v1/tools[/name]. Flaget er runtime-toggleable, så ruterne SKAL læse
 * den DB-mergede feature-view (getFeatures) — ikke statisk brand.config.
 *
 * Moat-invarianten (samme klasse som ucp/agent-card/mcp.json-testene):
 * overfladen svarer IFF flaget er på — off ⇒ 404 {error:"not_found"} og
 * INGEN nedstrøms kald (registry/auth røres ikke; short-circuit-rækkefølgen
 * låses med not.toHaveBeenCalled()).
 *
 * Opskrift: mock kun seams (@/lib/brand, registry, api-auth, MCP-SDK'en),
 * kør de RIGTIGE route-handlers, real public-gate.
 */

const { getFeaturesMock, registryMock, apiAuthMock } = vi.hoisted(() => ({
  getFeaturesMock: vi.fn(),
  registryMock: {
    listTools: vi.fn(() => [] as unknown[]),
    buildToolManifest: vi.fn(() => [] as unknown[]),
    getTool: vi.fn(),
    invokeTool: vi.fn(),
  },
  apiAuthMock: {
    authenticateApiKey: vi.fn(),
    requireApiScope: vi.fn(),
    apiErrorResponse: vi.fn(
      (e: { status: number; body: { error: string } }) =>
        Response.json({ ok: false, ...e.body }, { status: e.status }),
    ),
    actorToAuditString: vi.fn(() => "apikey:test"),
  },
}));

vi.mock("@/lib/brand", () => ({ getFeatures: getFeaturesMock }));
vi.mock("@/lib/tools/registry", () => registryMock);
vi.mock("@/lib/api-auth", () => apiAuthMock);
// MCP-SDK'en er tung og transport-koblet — stubbes; gaten fyrer FØR den nås.
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    registerTool() {}
    async connect() {}
  },
}));
vi.mock(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js",
  () => ({
    WebStandardStreamableHTTPServerTransport: class {
      async handleRequest() {
        return new Response("mcp-transport", { status: 200 });
      }
    },
  }),
);

function featuresWith(mcpPublic: boolean) {
  getFeaturesMock.mockResolvedValue({ mcpPublic });
}

beforeEach(() => {
  vi.clearAllMocks();
  registryMock.listTools.mockReturnValue([]);
  registryMock.buildToolManifest.mockReturnValue([]);
});

describe("GET /api/v1/tools — tool-kataloget", () => {
  it("flag OFF → 404 not_found og registry røres ALDRIG", async () => {
    featuresWith(false);
    const { GET } = await import("@/app/api/v1/tools/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tools"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(registryMock.listTools).not.toHaveBeenCalled();
    expect(registryMock.buildToolManifest).not.toHaveBeenCalled();
  });

  it("flag ON → 200 med count/tools/docs (compact)", async () => {
    featuresWith(true);
    registryMock.listTools.mockReturnValue([
      { name: "products.search", description: "d", scope: "products:read" },
    ]);
    const { GET } = await import("@/app/api/v1/tools/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tools"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.tools[0]).toMatchObject({ name: "products.search", revertible: false });
  });

  it("flag ON + ?schema=true → fuldt manifest via buildToolManifest", async () => {
    featuresWith(true);
    registryMock.buildToolManifest.mockReturnValue([
      { name: "products.search", scope: "products:read" },
    ]);
    const { GET } = await import("@/app/api/v1/tools/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/v1/tools?schema=true"),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
    expect(registryMock.buildToolManifest).toHaveBeenCalledTimes(1);
  });
});

describe("POST/GET /api/v1/tools/[name] — dispatcheren", () => {
  const params = Promise.resolve({ name: "products.search" });

  it("POST flag OFF → 404 FØR tool-lookup og FØR auth", async () => {
    featuresWith(false);
    const { POST } = await import("@/app/api/v1/tools/[name]/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/v1/tools/products.search", {
        method: "POST",
        body: "{}",
      }),
      { params },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(registryMock.getTool).not.toHaveBeenCalled();
    expect(apiAuthMock.requireApiScope).not.toHaveBeenCalled();
    expect(registryMock.invokeTool).not.toHaveBeenCalled();
  });

  it("POST flag ON → normal vej (ukendt tool = Tool not found, IKKE not_found)", async () => {
    featuresWith(true);
    registryMock.getTool.mockReturnValue(undefined);
    const { POST } = await import("@/app/api/v1/tools/[name]/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/v1/tools/products.search", {
        method: "POST",
        body: "{}",
      }),
      { params },
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Tool not found: products.search");
  });

  it("GET flag OFF → 404, manifest aldrig bygget", async () => {
    featuresWith(false);
    const { GET } = await import("@/app/api/v1/tools/[name]/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/v1/tools/products.search"),
      { params },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(registryMock.getTool).not.toHaveBeenCalled();
  });
});

describe("GET/POST /api/mcp — MCP-endpointet", () => {
  it("GET uden auth, flag OFF → 404 (IKKE den venlige intro)", async () => {
    featuresWith(false);
    const { GET } = await import("@/app/api/mcp/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/mcp"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
  });

  it("GET uden auth, flag ON → 200 menneskevenlig intro", async () => {
    featuresWith(true);
    const { GET } = await import("@/app/api/mcp/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/mcp"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocol).toMatch(/Model Context Protocol/);
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
  });

  it("POST flag OFF → 404 FØR authenticateApiKey", async () => {
    featuresWith(false);
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/mcp", { method: "POST", body: "{}" }),
    );

    expect(res.status).toBe(404);
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
  });

  it("POST flag ON → auth kører (401 fra auth propagerer, ikke 404)", async () => {
    featuresWith(true);
    apiAuthMock.authenticateApiKey.mockResolvedValue({
      error: { status: 401, body: { error: "Missing Authorization header" } },
    });
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/mcp", { method: "POST", body: "{}" }),
    );

    expect(res.status).toBe(401);
    expect(apiAuthMock.authenticateApiKey).toHaveBeenCalledTimes(1);
  });
});
