import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { publicAgentPerIpLimiter } from "@/lib/public-agent-rate-limit";
import { authAttemptPerIpLimiter } from "@/lib/auth-attempt-rate-limit";

/**
 * Moat regression — the /api/mcp **tool bridge** (`buildMcpServer`).
 *
 * `mcp-public-gate.test.ts` locks the OUTER shell of this route (mcpPublic flag
 * → 404 before auth; auth error propagates). Everything INSIDE — the bridge
 * between the MCP SDK and our tool registry — was untested, even though it is
 * the exact contract every MCP client (Claude Desktop, Cursor, ChatGPT) sees:
 *
 *   1. **Registration follows least privilege** — anonymous sessions receive
 *      only the explicit public allowlist, while authenticated sessions only
 *      discover tools covered by the key's granted scopes. Keys carrying all
 *      required scopes still see the full registry exactly once.
 *   2. **Failure must be visible.** A denied/failed tool call maps to
 *      `isError: true` + `[error <status>] <msg>`. If that flag is ever dropped,
 *      a 403 "missing scope" would reach the client as a *successful* tool
 *      result — the single worst silent failure on the agentic surface.
 *   3. **Scope enforcement is delegated, never re-implemented** — `invokeTool`
 *      receives the actor's granted scopes as its 4th argument, so MCP and REST
 *      share one authorization path.
 *   4. **Audit context is real** — actor string, a fresh requestId per call, and
 *      the request's `x-forwarded-for` / `user-agent` (null when absent), so an
 *      MCP-driven write is as traceable as a REST one.
 *   5. **Legacy `{args:{…}}` HTTP compatibility** — modern MCP clients send the
 *      concrete input directly, while one transition release unwraps the old
 *      request envelope before it reaches the SDK transport.
 *   6. **Transport is stateless + JSON** (`sessionIdGenerator: undefined`,
 *      `enableJsonResponse: true`) — required for the serverless runtime, where
 *      cross-request session state is not guaranteed.
 *   7. **GET *with* an Authorization header is a protocol call**, not the
 *      human-friendly intro page (which only answers unauthenticated GETs), and
 *      `DELETE` (MCP session termination) runs the same gate + auth path.
 *
 * Recipe: mock only the seams (`@/lib/brand`, the tool
 * registry, `@/lib/api-auth`, and the transport-coupled MCP SDK), then run the
 * REAL route handlers and the REAL public gate. The SDK stub captures each
 * `registerTool` call so the route's own handler can be invoked directly — what
 * is asserted here is OUR bridge code, not the SDK's behaviour.
 */

type RegisteredTool = {
  name: string;
  config: {
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
  };
  handler: (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }>;
};

type RegisteredResource = {
  name: string;
  uri: string;
  config: { title?: string; description?: string; mimeType?: string };
  handler: (uri: URL) => Promise<unknown>;
};

const {
  getFeaturesMock,
  registryMock,
  apiAuthMock,
  publicPagesMock,
  registered,
  registeredResources,
  serverInfos,
  transportCalls,
  transportRequests,
  connectCalls,
} = vi.hoisted(() => ({
  getFeaturesMock: vi.fn(),
  registryMock: {
    listTools: vi.fn(() => [] as unknown[]),
    invokeTool: vi.fn(),
  },
  apiAuthMock: {
    authenticateApiKey: vi.fn(),
    apiErrorResponse: vi.fn(
      (e: { status: number; body: { error: string } }) =>
        Response.json({ ok: false, ...e.body }, { status: e.status }),
    ),
    actorToAuditString: vi.fn((a: { apiKeyId: string }) => `apikey:${a.apiKeyId}`),
  },
  publicPagesMock: {
    findPublishedPageBySlug: vi.fn(),
    findFirstPublishedPageBySlugs: vi.fn(),
  },
  registered: [] as RegisteredTool[],
  registeredResources: [] as RegisteredResource[],
  serverInfos: [] as Array<{ name: string; version: string }>,
  transportCalls: [] as unknown[],
  transportRequests: [] as unknown[],
  connectCalls: [] as unknown[],
}));

vi.mock("@/lib/brand", () => ({
  getFeatures: getFeaturesMock,
  getFeatureGateState: async () => ({
    available: true,
    features: await getFeaturesMock(),
  }),
  getBrand: vi.fn(async () => ({
    url: "https://shop.example/",
    storeName: "Example Shop",
    storeSlug: "cartwright",
    ecommerceEnabled: false,
    defaultLocale: "en",
    company: {},
    contact: {},
  })),
}));
vi.mock("@/lib/tools/registry", () => registryMock);
vi.mock("@/lib/api-auth", () => apiAuthMock);
vi.mock("@/lib/public-pages", () => publicPagesMock);

// The SDK is transport-coupled; the stub records what the route registers so
// the route's OWN handler closure can be invoked and asserted.
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    constructor(
      public info: unknown,
      public options: unknown,
    ) {
      serverInfos.push(info as { name: string; version: string });
    }
    registerTool(
      name: string,
      config: RegisteredTool["config"],
      handler: RegisteredTool["handler"],
    ) {
      registered.push({ name, config, handler });
    }
    registerResource(
      name: string,
      uri: string,
      config: RegisteredResource["config"],
      handler: RegisteredResource["handler"],
    ) {
      registeredResources.push({ name, uri, config, handler });
    }
    async connect(transport: unknown) {
      connectCalls.push(transport);
    }
  },
}));
vi.mock(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js",
  () => ({
    WebStandardStreamableHTTPServerTransport: class {
      constructor(public options: unknown) {
        transportCalls.push(options);
      }
      async handleRequest(request: Request) {
        transportRequests.push(await request.clone().json().catch(() => null));
        return Response.json(
          { transport: "streamable-http", url: request.url },
          { status: 200 },
        );
      }
    },
  }),
);

const ACTOR = {
  type: "apikey" as const,
  apiKeyId: "key_42",
  userId: "user_7",
  scopes: ["products:read"] as const,
};

const FULL_ACTOR = {
  ...ACTOR,
  scopes: ["products:read", "products:write"] as const,
};

const TOOLS = [
  {
    name: "products.search",
    description: "Search the catalog",
    scope: "products:read",
    input: { marker: "search-schema" },
    output: z.object({
      hits: z.array(z.unknown()).optional(),
      id: z.string().optional(),
      title: z.string().optional(),
    }),
  },
  { name: "products.update", description: "Update a product", scope: "products:write", input: { marker: "update-schema" } },
];

function mcpRequest(
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  return new NextRequest("http://localhost:3000/api/mcp", {
    method: init.method ?? "POST",
    headers: init.headers ?? { authorization: "Bearer sb_live_x" },
    ...(init.method === "GET" || init.method === "DELETE" ? {} : { body: "{}" }),
  });
}

/** Runs POST /api/mcp all the way through the bridge and returns what it registered. */
async function runBridge(request = mcpRequest()) {
  const { POST } = await import("@/app/api/mcp/route");
  const res = await POST(request);
  return { res, tools: registered };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  publicAgentPerIpLimiter.reset();
  authAttemptPerIpLimiter.reset();
  registered.length = 0;
  registeredResources.length = 0;
  serverInfos.length = 0;
  transportCalls.length = 0;
  transportRequests.length = 0;
  connectCalls.length = 0;
  getFeaturesMock.mockResolvedValue({ mcpPublic: true });
  registryMock.listTools.mockReturnValue(TOOLS);
  apiAuthMock.authenticateApiKey.mockResolvedValue({ actor: FULL_ACTOR });
  publicPagesMock.findPublishedPageBySlug.mockResolvedValue(null);
  publicPagesMock.findFirstPublishedPageBySlugs.mockResolvedValue(null);
  registryMock.invokeTool.mockResolvedValue({ ok: true, result: { hits: [] } });
});

describe("/api/mcp — tool registration", () => {
  it("anonymous sessions discover only the explicit public allowlist", async () => {
    const { tools } = await runBridge(mcpRequest({ headers: {} }));
    expect(tools.map((tool) => tool.name)).toEqual(["products.search"]);
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
  });

  it("registers EVERY registry tool exactly once, with its name + description", async () => {
    const { tools } = await runBridge();

    expect(tools.map((t) => t.name)).toEqual([
      "products.search",
      "products.update",
    ]);
    expect(tools[0].config.description).toBe("Search the catalog");
    expect(tools[1].config.description).toBe("Update a product");
  });

  it("uses the same stable MCP server version published by discovery", async () => {
    await runBridge();

    expect(serverInfos).toEqual([{ name: "cartwright", version: "1.0.0" }]);
  });

  it("publishes each tool's concrete input schema directly", async () => {
    const { tools } = await runBridge();

    expect(tools).toHaveLength(TOOLS.length);
    expect(tools.map((tool) => tool.config.inputSchema)).toEqual(TOOLS.map((tool) => tool.input));
  });

  it("publishes a typed MCP output schema when the registry defines one", async () => {
    const { tools } = await runBridge();

    expect(tools[0].config.outputSchema).toBeDefined();
    expect(tools[1].config.outputSchema).toBeUndefined();
  });

  it("annotates every anonymously exposed tool as read-only and non-destructive", async () => {
    const { tools } = await runBridge(mcpRequest({ headers: {} }));
    expect(tools).toHaveLength(1);
    expect(tools[0].config.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("exposes only public, typed resources with runtime-resolved URLs", async () => {
    await runBridge(mcpRequest({ headers: {} }));

    expect(registeredResources.map(({ name, uri, config }) => ({
      name,
      uri,
      mimeType: config.mimeType,
    }))).toEqual([
      {
        name: "llms.txt",
        uri: "https://shop.example/llms.txt",
        mimeType: "text/markdown",
      },
      {
        name: "sitemap",
        uri: "https://shop.example/sitemap.xml",
        mimeType: "application/xml",
      },
      {
        name: "public-trust",
        uri: "https://shop.example/en/about",
        mimeType: "application/json",
      },
    ]);
  });

  it("serves published CMS trust content and falls back only when no public page exists", async () => {
    publicPagesMock.findPublishedPageBySlug.mockImplementation(
      async (slug: string) =>
        slug === "privacy"
          ? {
              slug,
              title: "Current privacy policy",
              body: "The policy currently published by the site owner.",
              metaDescription: "Current policy",
              updatedAt: new Date("2026-08-22T12:00:00.000Z"),
            }
          : null,
    );
    await runBridge(mcpRequest({ headers: {} }));
    const resource = registeredResources.find(
      ({ name }) => name === "public-trust",
    );
    expect(resource).toBeDefined();

    const result = (await resource!.handler(
      new URL("https://shop.example/en/about"),
    )) as { contents: Array<{ text: string }> };
    const trust = JSON.parse(result.contents[0].text);

    expect(trust.privacy).toMatchObject({
      slug: "privacy",
      title: "Current privacy policy",
      body: "The policy currently published by the site owner.",
      updatedAt: "2026-08-22T12:00:00.000Z",
    });
    expect(trust.about).toMatchObject({
      slug: "about",
      updatedAt: null,
    });
    expect(trust.about.body.length).toBeGreaterThan(500);
  });

  it("sanitizes public-resource failures before the MCP SDK can serialize them", async () => {
    publicPagesMock.findPublishedPageBySlug.mockRejectedValue(
      new Error(
        "postgres://admin:secret@db.internal/shop relation pages missing",
      ),
    );
    publicPagesMock.findFirstPublishedPageBySlugs.mockRejectedValue(
      new Error(
        "postgres://admin:secret@db.internal/shop relation pages missing",
      ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runBridge(mcpRequest({ headers: {} }));
    const resource = registeredResources.find(
      ({ name }) => name === "public-trust",
    );

    let thrown: unknown;
    try {
      await resource!.handler(new URL("https://shop.example/en/about"));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: -32603 });
    expect((thrown as Error).message).toContain(
      "The resource could not be loaded because of an internal service error.",
    );
    expect(JSON.stringify(thrown)).not.toContain("secret");
    expect(JSON.stringify(thrown)).not.toContain("db.internal");
    expect(errorSpy).toHaveBeenCalledWith(
      '[mcp] Public resource "public-trust" could not be loaded.',
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret");
    errorSpy.mockRestore();
  });

  it("registers only tools covered by the authenticated key's scopes", async () => {
    apiAuthMock.authenticateApiKey.mockResolvedValue({ actor: ACTOR });
    const { tools } = await runBridge();

    expect(tools.map((tool) => tool.name)).toEqual(["products.search"]);
    expect(tools.map((tool) => tool.name)).not.toContain("products.update");
  });

  it("returns the transport response untouched (the bridge must not swallow it)", async () => {
    const { res } = await runBridge();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      transport: "streamable-http",
      url: "http://localhost:3000/api/mcp",
    });
    expect(connectCalls).toHaveLength(1);
  });

  it("uses a stateless transport with JSON responses (the serverless requirement)", async () => {
    await runBridge();

    expect(transportCalls).toHaveLength(1);
    expect(transportCalls[0]).toMatchObject({ enableJsonResponse: true });
    expect(
      (transportCalls[0] as { sessionIdGenerator?: unknown }).sessionIdGenerator,
    ).toBeUndefined();
  });

  it("unwraps the legacy {args:{…}} tools/call envelope before the transport", async () => {
    await runBridge(
      new NextRequest("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: {
            name: "products.search",
            arguments: { args: { q: "aviator", limit: 3 } },
          },
        }),
      }),
    );

    expect(transportRequests[0]).toMatchObject({
      method: "tools/call",
      params: {
        name: "products.search",
        arguments: { q: "aviator", limit: 3 },
      },
    });
  });
});

describe("/api/mcp — the handler contract against the registry", () => {
  it("ok result → text content with pretty JSON and NO isError", async () => {
    registryMock.invokeTool.mockResolvedValue({
      ok: true,
      result: { id: "p1", title: "Aviator" },
    });
    const { tools } = await runBridge();

    const out = await tools[0].handler({ q: "aviator" });

    expect(out.isError).toBeUndefined();
    expect(out.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ id: "p1", title: "Aviator" }, null, 2),
      },
    ]);
    expect(out.structuredContent).toEqual({
      result: { id: "p1", title: "Aviator" },
    });
  });

  it("failed result → isError:true and '[error <status>] <msg>' (must NEVER look like success)", async () => {
    registryMock.invokeTool.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Missing scope: products:write",
    });
    const { tools } = await runBridge();

    const out = await tools[1].handler({ args: { id: "p1" } });

    expect(out.isError).toBe(true);
    expect(out.content).toEqual([
      { type: "text", text: "[error 403] Missing scope: products:write" },
    ]);
  });

  it("sanitizes internal handler failures before they cross the MCP boundary", async () => {
    registryMock.invokeTool.mockResolvedValue({
      ok: false,
      status: 500,
      error:
        "postgres://admin:secret@db.internal/shop: relation products missing",
    });
    const { tools } = await runBridge(mcpRequest({ headers: {} }));

    const out = await tools[0].handler({ q: "aviator" });

    expect(out.isError).toBe(true);
    expect(out.content).toEqual([
      {
        type: "text",
        text: "[error 500] The tool could not complete because of an internal service error.",
      },
    ]);
    expect(JSON.stringify(out)).not.toContain("secret");
    expect(JSON.stringify(out)).not.toContain("db.internal");
  });

  it("passes the key's scopes to invokeTool (enforcement delegated, never re-implemented)", async () => {
    apiAuthMock.authenticateApiKey.mockResolvedValue({ actor: ACTOR });
    const { tools } = await runBridge();
    await tools[0].handler({});

    expect(registryMock.invokeTool).toHaveBeenCalledTimes(1);
    const [name, args, , granted] = registryMock.invokeTool.mock.calls[0];
    expect(name).toBe("products.search");
    expect(args).toEqual({});
    expect(granted).toEqual(ACTOR.scopes);
  });

  it("passes an empty direct argument object through unchanged", async () => {
    const { tools } = await runBridge();
    await tools[0].handler({});

    expect(registryMock.invokeTool.mock.calls[0][1]).toEqual({});
  });

  it("audit context: actor string, a fresh requestId, trusted proxy IP, user-agent", async () => {
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "true");
    const { tools } = await runBridge(
      mcpRequest({
        headers: {
          authorization: "Bearer sb_live_x",
          "x-forwarded-for": "203.0.113.7",
          "user-agent": "Claude-Desktop/1.0",
        },
      }),
    );

    await tools[0].handler({ args: {} });
    await tools[0].handler({ args: {} });

    const first = registryMock.invokeTool.mock.calls[0][2];
    const second = registryMock.invokeTool.mock.calls[1][2];
    expect(first).toMatchObject({
      actor: "apikey:key_42",
      ip: "203.0.113.7",
      userAgent: "Claude-Desktop/1.0",
    });
    // v4 shape incl. version + variant nibbles — a same-length hand-rolled id
    // would not satisfy this.
    expect(first.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    // Every call must be traceable on its own — otherwise the audit trail collapses.
    expect(second.requestId).not.toBe(first.requestId);
  });

  it("ip/userAgent are null when the headers are absent (no 'unknown' strings in the audit trail)", async () => {
    const { tools } = await runBridge();
    await tools[0].handler({ args: {} });

    expect(registryMock.invokeTool.mock.calls[0][2]).toMatchObject({
      ip: null,
      userAgent: null,
    });
  });
});

describe("/api/mcp — HTTP verbs", () => {
  it("rejects anonymous JSON-RPC batches before transport so one token cannot invoke many tools", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "products.search", arguments: { q: "one" } },
          },
          {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "products.search", arguments: { q: "two" } },
          },
        ]),
      }),
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(res.headers.get("ratelimit-remaining")).toBe("59");
    await expect(res.json()).resolves.toMatchObject({
      code: "anonymous_mcp_batch_not_allowed",
      ok: false,
    });
    expect(transportRequests).toHaveLength(0);
    expect(registryMock.invokeTool).not.toHaveBeenCalled();
  });

  it("keeps JSON-RPC batching available to authenticated scoped clients", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const batch = [
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "resources/list" },
    ];
    const res = await POST(
      new NextRequest("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer sb_live_x",
          "content-type": "application/json",
        },
        body: JSON.stringify(batch),
      }),
    );

    expect(res.status).toBe(200);
    expect(transportRequests).toContainEqual(batch);
    expect(res.headers.get("ratelimit-limit")).toBe("120");
    expect(res.headers.get("ratelimit-policy")).toBe(
      '"auth-attempt";q=120;w=60',
    );
  });

  it("GET WITH Authorization is a protocol call, not the intro page", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    const res = await GET(
      mcpRequest({ method: "GET", headers: { authorization: "Bearer sb_live_x" } }),
    );

    expect(apiAuthMock.authenticateApiKey).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ transport: "streamable-http" });
  });

  it("DELETE (session termination) runs the same gate + auth", async () => {
    getFeaturesMock.mockResolvedValue({ mcpPublic: false });
    const { DELETE } = await import("@/app/api/mcp/route");
    const res = await DELETE(mcpRequest({ method: "DELETE" }));

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/api/mcp",
    });
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
  });

  it("DELETE with the gate OPEN authenticates and reaches the transport", async () => {
    const { DELETE } = await import("@/app/api/mcp/route");
    const res = await DELETE(mcpRequest({ method: "DELETE" }));

    expect(apiAuthMock.authenticateApiKey).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ transport: "streamable-http" });
  });

  it("auth failure → no server is built and NO tools are registered", async () => {
    apiAuthMock.authenticateApiKey.mockResolvedValue({
      error: { status: 401, body: { error: "Invalid API key" } },
    });
    const { res, tools } = await runBridge();

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer realm="cartwright-mcp"',
    );
    expect(tools).toHaveLength(0);
    expect(registryMock.listTools).not.toHaveBeenCalled();
  });
});
