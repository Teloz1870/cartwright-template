import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { publicAgentPerIpLimiter } from "@/lib/public-agent-rate-limit";
import { authAttemptPerIpLimiter } from "@/lib/auth-attempt-rate-limit";

/**
 * TREND30-a — an anonymous /api/mcp `tools/call` may carry at most 1,000
 * array elements plus object members in its arguments.
 *
 * The ceiling is the SDK's own `maxToolInputElements`, so this file runs the
 * REAL `@modelcontextprotocol/sdk` server and transport — `mcp-tool-bridge`
 * stubs both and would pass whatever the route passed as options. Only the
 * seams are mocked (`@/lib/brand`, the tool registry, `@/lib/api-auth`,
 * `@/lib/public-pages`); the route, the public gate, the legacy-argument
 * unwrap and the SDK's counting are all real.
 *
 * What is pinned:
 *   1. The boundary: 1,000 counted elements pass, 1,001 are refused — for an
 *      array and for nested objects alike.
 *   2. A refused call never reaches `invokeTool`, and the SDK reports it the
 *      way it reports any input error: HTTP 200, a JSON-RPC `result` with
 *      `isError: true` — not a JSON-RPC `error`.
 *   3. The count runs on the arguments AFTER the legacy `{args:{…}}` unwrap.
 *   4. An API-key session has no ceiling.
 *   5. With `mcpPublic` off the route still answers 404 before any of this.
 */

const { getFeaturesMock, registryMock, apiAuthMock, publicPagesMock } =
  vi.hoisted(() => ({
    getFeaturesMock: vi.fn(),
    registryMock: {
      listTools: vi.fn(() => [] as unknown[]),
      invokeTool: vi.fn(),
    },
    apiAuthMock: {
      authenticateApiKey: vi.fn(),
      actorToAuditString: vi.fn(
        (a: { apiKeyId: string }) => `apikey:${a.apiKeyId}`,
      ),
    },
    publicPagesMock: {
      findPublishedPageBySlug: vi.fn(),
      findFirstPublishedPageBySlugs: vi.fn(),
    },
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

// A public-allowlist name, so the anonymous session registers it. No real
// public tool takes an array; this one does, to reach the ceiling at all.
const TOOL = {
  name: "products.search",
  description: "Search the catalog",
  scope: "catalog:read",
  input: z.object({
    ids: z.array(z.number()).optional(),
    nested: z.unknown().optional(),
  }),
};

const ACTOR = {
  type: "apikey" as const,
  apiKeyId: "key_42",
  userId: "user_7",
  scopes: ["catalog:read"],
};

type ToolCallResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: { content: Array<{ type: string; text: string }>; isError?: boolean };
  error?: { code: number; message: string };
};

async function callTool(
  args: unknown,
  { authenticated = false }: { authenticated?: boolean } = {},
) {
  const { POST } = await import("@/app/api/mcp/route");
  const res = await POST(
    new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(authenticated ? { authorization: "Bearer sb_live_x" } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: TOOL.name, arguments: args },
      }),
    }),
  );
  return { res, body: (await res.json()) as ToolCallResponse };
}

const numbers = (n: number) => Array.from({ length: n }, (_, i) => i);

beforeEach(() => {
  vi.clearAllMocks();
  publicAgentPerIpLimiter.reset();
  authAttemptPerIpLimiter.reset();
  getFeaturesMock.mockResolvedValue({ mcpPublic: true });
  registryMock.listTools.mockReturnValue([TOOL]);
  registryMock.invokeTool.mockResolvedValue({ ok: true, result: { hits: [] } });
  apiAuthMock.authenticateApiKey.mockResolvedValue({ actor: ACTOR });
  publicPagesMock.findPublishedPageBySlug.mockResolvedValue(null);
  publicPagesMock.findFirstPublishedPageBySlugs.mockResolvedValue(null);
});

describe("/api/mcp — anonymous tool-input ceiling (real SDK)", () => {
  it("accepts an anonymous call of exactly 1,000 elements (the key + 999 items)", async () => {
    const { res, body } = await callTool({ ids: numbers(999) });

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.result?.isError).toBeFalsy();
    expect(registryMock.invokeTool).toHaveBeenCalledTimes(1);
    expect(registryMock.invokeTool.mock.calls[0][1]).toEqual({ ids: numbers(999) });
  });

  it("refuses 1,001 elements as an isError result and never invokes the tool", async () => {
    const { res, body } = await callTool({ ids: numbers(1000) });

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content[0].text).toMatch(
      /more than the maximum of 1000 elements/,
    );
    expect(registryMock.invokeTool).not.toHaveBeenCalled();
  });

  it("counts object members recursively, not only array items", async () => {
    // 1 (`nested`) + 500 keys + 500 inner `x` members = 1,001.
    const nested = Object.fromEntries(
      numbers(500).map((i) => [`k${i}`, { x: 1 }]),
    );
    const { body } = await callTool({ nested });

    expect(body.result?.isError).toBe(true);
    expect(body.result?.content[0].text).toMatch(
      /more than the maximum of 1000 elements/,
    );
    expect(registryMock.invokeTool).not.toHaveBeenCalled();
  });

  it("counts the arguments after the legacy {args:{…}} unwrap", async () => {
    // Wrapped, this is 1,001 elements; unwrapped it is exactly 1,000.
    const { body } = await callTool({ args: { ids: numbers(999) } });

    expect(body.result?.isError).toBeFalsy();
    expect(registryMock.invokeTool).toHaveBeenCalledTimes(1);
    expect(registryMock.invokeTool.mock.calls[0][1]).toEqual({ ids: numbers(999) });
  });

  it("leaves an API-key session uncapped", async () => {
    const { res, body } = await callTool(
      { ids: numbers(5000) },
      { authenticated: true },
    );

    expect(res.status).toBe(200);
    expect(body.result?.isError).toBeFalsy();
    expect(apiAuthMock.authenticateApiKey).toHaveBeenCalledTimes(1);
    expect(registryMock.invokeTool).toHaveBeenCalledTimes(1);
    expect(registryMock.invokeTool.mock.calls[0][1]).toEqual({ ids: numbers(5000) });
  });

  it("still answers 404 before any tool work when mcpPublic is off", async () => {
    getFeaturesMock.mockResolvedValue({ mcpPublic: false });
    const { res, body } = await callTool({ ids: numbers(1000) });

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ code: "agent_interface_not_found" });
    expect(registryMock.listTools).not.toHaveBeenCalled();
    expect(registryMock.invokeTool).not.toHaveBeenCalled();
  });
});
