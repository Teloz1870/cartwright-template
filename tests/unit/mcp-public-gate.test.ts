import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { publicAgentPerIpLimiter } from "@/lib/rate-limit";

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

vi.mock("@/lib/brand", () => ({
  getFeatures: getFeaturesMock,
  getBrand: vi.fn(async () => ({ url: "https://shop.example/", storeName: "Example Shop", defaultLocale: "en", company: {}, contact: {} })),
}));
vi.mock("@/lib/tools/registry", () => registryMock);
vi.mock("@/lib/api-auth", () => apiAuthMock);
// MCP-SDK'en er tung og transport-koblet — stubbes; gaten fyrer FØR den nås.
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    registerTool() {}
    registerResource() {}
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
  publicAgentPerIpLimiter.reset();
  registryMock.listTools.mockReturnValue([]);
  registryMock.buildToolManifest.mockReturnValue([]);
});

describe("GET /api/v1/tools — tool-kataloget", () => {
  it("flag OFF → 404 not_found og registry røres ALDRIG", async () => {
    featuresWith(false);
    const { GET } = await import("@/app/api/v1/tools/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tools"));

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/api/v1/tools",
      ok: false,
    });
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
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({ status: 404, code: "agent_interface_not_found", ok: false });
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
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({ status: 404, code: "agent_interface_not_found", ok: false });
    expect(registryMock.getTool).not.toHaveBeenCalled();
  });

  it("GET unknown tool → RFC Problem Details with discovery guidance", async () => {
    featuresWith(true);
    registryMock.getTool.mockReturnValue(undefined);
    const { GET } = await import("@/app/api/v1/tools/[name]/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/v1/tools/does.not_exist"),
      { params: Promise.resolve({ name: "does.not_exist" }) },
    );

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "tool_not_found",
      instance: "/api/v1/tools/does.not_exist",
      ok: false,
      error: "Tool not found: does.not_exist",
      resolution: "Use GET /api/v1/tools to discover available tools.",
    });
  });

  it("public allowlist executes anonymously and includes RateLimit headers", async () => {
    featuresWith(true);
    registryMock.getTool.mockReturnValue({ name: "products.search", scope: "catalog:read" });
    registryMock.invokeTool.mockResolvedValue({ ok: true, result: [{ slug: "one" }] });
    const { POST } = await import("@/app/api/v1/tools/[name]/route");
    const res = await POST(new NextRequest("http://localhost:3000/api/v1/tools/products.search", {
      method: "POST", body: "{}", headers: { "x-forwarded-for": "203.0.113.8" },
    }), { params });

    expect(res.status).toBe(200);
    expect(apiAuthMock.requireApiScope).not.toHaveBeenCalled();
    expect(res.headers.get("ratelimit-limit")).toBeTruthy();
    expect(registryMock.invokeTool.mock.calls[0][2]).toMatchObject({ actor: "system:public-agent" });
  });

  it("shares one anonymous per-IP budget across REST and MCP with complete 429 headers", async () => {
    featuresWith(true);
    registryMock.getTool.mockReturnValue({
      name: "products.search",
      scope: "catalog:read",
    });
    registryMock.invokeTool.mockResolvedValue({ ok: true, result: [] });
    const [{ POST: restPost }, { POST: mcpPost }] = await Promise.all([
      import("@/app/api/v1/tools/[name]/route"),
      import("@/app/api/mcp/route"),
    ]);
    const ip = "198.51.100.44";

    for (let requestNumber = 0; requestNumber < 59; requestNumber += 1) {
      const res = await restPost(
        new NextRequest(
          "http://localhost:3000/api/v1/tools/products.search",
          {
            method: "POST",
            body: "{}",
            headers: { "x-forwarded-for": ip },
          },
        ),
        { params },
      );
      expect(res.status).toBe(200);
    }

    const finalAllowed = await mcpPost(
      new NextRequest("http://localhost:3000/api/mcp", {
        method: "POST",
        body: "{}",
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(finalAllowed.status).toBe(200);
    expect(finalAllowed.headers.get("ratelimit-remaining")).toBe("0");

    const blocked = await restPost(
      new NextRequest(
        "http://localhost:3000/api/v1/tools/products.search",
        {
          method: "POST",
          body: "{}",
          headers: { "x-forwarded-for": ip },
        },
      ),
      { params },
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(blocked.headers.get("ratelimit-limit")).toBe("60");
    expect(blocked.headers.get("ratelimit-remaining")).toBe("0");
    expect(blocked.headers.get("ratelimit-policy")).toBe("60;w=60");
    expect(Number(blocked.headers.get("ratelimit-reset"))).toBeGreaterThan(0);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    await expect(blocked.json()).resolves.toMatchObject({
      status: 429,
      code: "rate_limit_exceeded",
      instance: "/api/v1/tools/products.search",
      ok: false,
    });
  });

  it("non-public tools still require a scoped Bearer key", async () => {
    featuresWith(true);
    registryMock.getTool.mockReturnValue({ name: "orders.list", scope: "orders:read" });
    apiAuthMock.requireApiScope.mockResolvedValue({ error: { status: 401, body: { error: "Missing Authorization header" } } });
    const { POST } = await import("@/app/api/v1/tools/[name]/route");
    const res = await POST(new NextRequest("http://localhost:3000/api/v1/tools/orders.list", {
      method: "POST", body: "{}",
    }), { params: Promise.resolve({ name: "orders.list" }) });

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(registryMock.invokeTool).not.toHaveBeenCalled();
  });
});

/**
 * `OPTIONS` on the REST half of the surface — the same gap #429 closed on
 * `/api/mcp`, in the two places that sweep missed.
 *
 * A route module that exports no `OPTIONS` does not refuse the verb: Next
 * installs its own handler, which answers `204` + `Allow` as framework code and
 * therefore never reaches `mcpPublicDisabledResponse()`. Measured on a
 * production build before the fix: `/api/v1/tools` answered
 * `204 allow: GET, HEAD, OPTIONS` with the flag OFF, while GET on the same path
 * returned the 404 that is supposed to mean "nothing is here".
 *
 * Both sides are pinned: gate-first when the flag is off, and — when it lets a
 * caller through — the same plain `204` + `Allow` Next used to send, so no
 * existing client sees a different answer.
 */
describe("OPTIONS /api/v1/tools — the verb Next used to answer on its own", () => {
  it("flag OFF → the same 404 as GET, and NO Allow header", async () => {
    featuresWith(false);
    const { OPTIONS } = await import("@/app/api/v1/tools/route");
    const res = await OPTIONS();

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/api/v1/tools",
    });
    // Both halves of the old answer leaked, at different grains. The `204`
    // told a caller a route is mounted here at all — an absent path answers
    // `404` to `OPTIONS` like it does to anything else. The `Allow` then named
    // the verbs it answers. Fixing only the status would leave the second
    // disclosure standing, which is why this is asserted separately.
    expect(res.headers.get("allow")).toBeNull();
    expect(registryMock.listTools).not.toHaveBeenCalled();
  });

  it("flag ON → 204 + Allow, uncacheable, and no CORS grant riding along", async () => {
    featuresWith(true);
    const { OPTIONS } = await import("@/app/api/v1/tools/route");
    const res = await OPTIONS();

    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(res.headers.get("cache-control")).toBe("no-store");
    // Not a preflight: this route answers none and must not start here.
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-methods")).toBeNull();
    // `Vary: Origin` would claim a variance this route does not have — only
    // /api/mcp checks Origin.
    expect(res.headers.get("vary")).toBeNull();
    // A metadata verb builds no catalogue.
    expect(registryMock.listTools).not.toHaveBeenCalled();
    expect(registryMock.buildToolManifest).not.toHaveBeenCalled();
  });

  it("Allow = the module's own verb exports + the HEAD the framework adds", async () => {
    // Guards the hand-written string against a third export: adding one without
    // extending ALLOWED_METHODS would leave the route advertising fewer methods
    // than it answers. Derived from the module rather than retyped, so it goes
    // red on the addition instead of quietly disagreeing.
    //
    // HEAD is the one member with no export behind it: Next implements it from
    // GET (`autoImplementMethods`: `methods.HEAD = handlers.GET`), so
    // `HEAD /api/v1/tools` runs the gated GET handler and belongs in `Allow` —
    // while `Object.keys` will never show it.
    featuresWith(true);
    const HTTP_VERBS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
    const mod = await import("@/app/api/v1/tools/route");
    const exportedVerbs = Object.keys(mod).filter((key) => HTTP_VERBS.has(key));
    const res = await mod.OPTIONS();

    // Non-vacuous on both sides: a real set of exports, and the header equals
    // exactly that set plus HEAD — nothing invented, nothing dropped.
    expect(exportedVerbs.sort()).toEqual(["GET", "OPTIONS"]);
    expect(res.headers.get("allow")?.split(", ")).toEqual(
      [...exportedVerbs, "HEAD"].sort(),
    );
  });

  it("HEAD is not exported — it exists only because GET is (the reason Allow lists it)", async () => {
    const mod = await import("@/app/api/v1/tools/route");

    expect("HEAD" in mod).toBe(false);
    expect("GET" in mod).toBe(true);
  });
});

describe("OPTIONS /api/v1/tools/[name] — gated, and deliberately name-blind", () => {
  it("flag OFF → 404 not_found, no Allow, and no tool lookup", async () => {
    featuresWith(false);
    const { OPTIONS } = await import("@/app/api/v1/tools/[name]/route");
    const res = await OPTIONS();

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/api/v1/tools/{name}",
    });
    expect(res.headers.get("allow")).toBeNull();
    expect(registryMock.getTool).not.toHaveBeenCalled();
  });

  it("flag ON → 204 + Allow including POST, no CORS grant, no auth", async () => {
    featuresWith(true);
    const { OPTIONS } = await import("@/app/api/v1/tools/[name]/route");
    const res = await OPTIONS();

    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("vary")).toBeNull();
    expect(apiAuthMock.requireApiScope).not.toHaveBeenCalled();
  });

  it("answers identically for a registered and an unregistered tool name — no unauthenticated existence oracle", async () => {
    // The handler takes no params on purpose. Resolving the name would let an
    // anonymous caller sweep a guessed vocabulary for which tools a shop has
    // registered.
    //
    // The load-bearing assertion is `getTool` was never consulted — the two
    // calls below only show the responses are indistinguishable. Note the
    // mocked answer is deliberately NOT varied between them: `vi.clearAllMocks`
    // in beforeEach resets call history, not implementations, so a
    // `mockReturnValue` left behind here would leak into later describes.
    featuresWith(true);
    const { OPTIONS } = await import("@/app/api/v1/tools/[name]/route");

    const first = await OPTIONS();
    const second = await OPTIONS();

    expect(first.status).toBe(second.status);
    expect(first.headers.get("allow")).toBe(second.headers.get("allow"));
    expect(registryMock.getTool).not.toHaveBeenCalled();
  });

  it("Allow = the module's own verb exports + the HEAD the framework adds", async () => {
    featuresWith(true);
    const HTTP_VERBS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
    const mod = await import("@/app/api/v1/tools/[name]/route");
    const exportedVerbs = Object.keys(mod).filter((key) => HTTP_VERBS.has(key));
    const res = await mod.OPTIONS();

    expect(exportedVerbs.sort()).toEqual(["GET", "OPTIONS", "POST"]);
    expect(res.headers.get("allow")?.split(", ")).toEqual(
      [...exportedVerbs, "HEAD"].sort(),
    );
  });
});

describe("GET/POST /api/mcp — MCP-endpointet", () => {
  it("GET uden auth, flag OFF → 404 (IKKE den venlige intro)", async () => {
    featuresWith(false);
    const { GET } = await import("@/app/api/mcp/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/mcp"));

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/api/mcp",
    });
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

  it("POST flag ON uden Authorization → anonym MCP-handshake uden auth lookup", async () => {
    featuresWith(true);
    apiAuthMock.authenticateApiKey.mockResolvedValue({
      error: { status: 401, body: { error: "Missing Authorization header" } },
    });
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/mcp", { method: "POST", body: "{}" }),
    );

    expect(res.status).toBe(200);
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
  });
});
