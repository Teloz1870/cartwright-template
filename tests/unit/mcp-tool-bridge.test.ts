import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Moat regression — the /api/mcp **tool bridge** (`buildMcpServer`).
 *
 * `mcp-public-gate.test.ts` locks the OUTER shell of this route (mcpPublic flag
 * → 404 before auth; auth error propagates). Everything INSIDE — the bridge
 * between the MCP SDK and our tool registry — was untested, even though it is
 * the exact contract every MCP client (Claude Desktop, Cursor, ChatGPT) sees:
 *
 *   1. **Registration is 1:1 with the registry** — every `listTools()` entry is
 *      registered once, under its own name + description. The route does NOT
 *      pre-filter by the key's scopes: the full surface is advertised and
 *      enforcement happens per invocation (same model as the REST dispatcher).
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
 *   5. **`args` unwrapping** — the MCP wrapper schema is `{ args }`; a call with
 *      no args must reach the registry as `{}`, never `undefined` (Zod schemas
 *      with all-optional fields would otherwise behave differently per client).
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
  config: { description?: string; inputSchema?: unknown };
  handler: (input: { args?: unknown }) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
};

const {
  getFeaturesMock,
  registryMock,
  apiAuthMock,
  registered,
  transportCalls,
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
  registered: [] as RegisteredTool[],
  transportCalls: [] as unknown[],
  connectCalls: [] as unknown[],
}));

vi.mock("@/lib/brand", () => ({ getFeatures: getFeaturesMock }));
vi.mock("@/lib/tools/registry", () => registryMock);
vi.mock("@/lib/api-auth", () => apiAuthMock);

// The SDK is transport-coupled; the stub records what the route registers so
// the route's OWN handler closure can be invoked and asserted.
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    constructor(
      public info: unknown,
      public options: unknown,
    ) {}
    registerTool(
      name: string,
      config: RegisteredTool["config"],
      handler: RegisteredTool["handler"],
    ) {
      registered.push({ name, config, handler });
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
      handleRequest(request: Request) {
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

const TOOLS = [
  { name: "products.search", description: "Search the catalog", scope: "products:read" },
  { name: "products.update", description: "Update a product", scope: "products:write" },
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
  registered.length = 0;
  transportCalls.length = 0;
  connectCalls.length = 0;
  getFeaturesMock.mockResolvedValue({ mcpPublic: true });
  registryMock.listTools.mockReturnValue(TOOLS);
  apiAuthMock.authenticateApiKey.mockResolvedValue({ actor: ACTOR });
  registryMock.invokeTool.mockResolvedValue({ ok: true, result: { hits: [] } });
});

describe("/api/mcp — tool registration", () => {
  it("registers EVERY registry tool exactly once, with its name + description", async () => {
    const { tools } = await runBridge();

    expect(tools.map((t) => t.name)).toEqual([
      "products.search",
      "products.update",
    ]);
    expect(tools[0].config.description).toBe("Search the catalog");
    expect(tools[1].config.description).toBe("Update a product");
  });

  it("wraps every tool's inputSchema under the single `args` key", async () => {
    // `args` is the client-facing wrapper name: the SDK turns this raw Zod
    // shape into the JSON Schema every MCP client fills in, and the handler
    // reads `input.args` back out. A *consistent* rename (schema + cast +
    // handler type) still typechecks, so tsc does not catch it — this test is
    // the only gate, and the payload of every existing client would then be
    // dropped (`InvalidParams` for tools with required fields, silent
    // empty-args execution for all-optional ones).
    const { tools } = await runBridge();

    expect(tools).toHaveLength(TOOLS.length);
    for (const tool of tools) {
      expect(Object.keys(tool.config.inputSchema as Record<string, unknown>)).toEqual([
        "args",
      ]);
    }
  });

  it("does NOT pre-filter on the key's scopes — the full surface is advertised, enforcement is per call", async () => {
    // ACTOR only holds products:read; products.update (products:write) must STILL
    // be registered — otherwise a client would conclude the tool does not exist
    // instead of getting a 403 that explains why.
    const { tools } = await runBridge();

    expect(tools.map((t) => t.name)).toContain("products.update");
    expect(tools).toHaveLength(TOOLS.length);
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
});

describe("/api/mcp — the handler contract against the registry", () => {
  it("ok result → text content with pretty JSON and NO isError", async () => {
    registryMock.invokeTool.mockResolvedValue({
      ok: true,
      result: { id: "p1", title: "Aviator" },
    });
    const { tools } = await runBridge();

    const out = await tools[0].handler({ args: { q: "aviator" } });

    expect(out.isError).toBeUndefined();
    expect(out.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ id: "p1", title: "Aviator" }, null, 2),
      },
    ]);
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

  it("passes the key's scopes to invokeTool (enforcement delegated, never re-implemented)", async () => {
    const { tools } = await runBridge();
    await tools[1].handler({ args: {} });

    expect(registryMock.invokeTool).toHaveBeenCalledTimes(1);
    const [name, args, , granted] = registryMock.invokeTool.mock.calls[0];
    expect(name).toBe("products.update");
    expect(args).toEqual({});
    expect(granted).toEqual(ACTOR.scopes);
  });

  it("missing args becomes {} — never undefined", async () => {
    const { tools } = await runBridge();
    await tools[0].handler({});

    expect(registryMock.invokeTool.mock.calls[0][1]).toEqual({});
  });

  it("audit context: actor string, a fresh requestId, ip from x-forwarded-for, user-agent", async () => {
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
    expect(await res.json()).toEqual({ error: "not_found" });
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
    expect(tools).toHaveLength(0);
    expect(registryMock.listTools).not.toHaveBeenCalled();
  });
});
