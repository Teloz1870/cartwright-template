import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * A tool's `extraScopes` (DRØM134-b): scopes a key must hold ON TOP of the
 * tool's primary `scope`. `marketing.create_campaign` issues a discount code, so
 * a key with `marketing:write` alone must not be a way round `discounts:write`.
 *
 * Each enforcement point is driven for real — the registry's `invokeTool`, the
 * REST dispatcher (whose `requireApiScope` runs against a mocked key row), and
 * `POST /api/mcp` `tools/list` — plus every document that lists a tool's scope.
 * Only `@/lib/db` (the key row) and `@/lib/brand` (the shop) are mocked.
 */

const { prismaMock, keyScopes } = vi.hoisted(() => ({
  prismaMock: { apiKey: { findUnique: vi.fn(), update: vi.fn() } },
  keyScopes: { value: [] as string[] },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/brand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brand")>();
  const { brand } = await import("@/brand.config");
  const features = { mcpPublic: true, webshop: true };
  return {
    ...actual,
    getBrand: async () => ({ ...brand, ecommerceEnabled: true, features, source: "db" }),
    getFeatures: async () => features,
    getFeatureGateState: async () => ({ available: true, features }),
  };
});

import { generateApiKey, requireApiScope } from "@/lib/api-auth";
import { authAttemptPerIpLimiter } from "@/lib/auth-attempt-rate-limit";
import { publicAgentPerIpLimiter } from "@/lib/public-agent-rate-limit";
import { isValidScope, type Scope } from "@/lib/scopes";
import { buildToolManifest, getTool, invokeTool, listTools } from "@/lib/tools/registry";
import { hasToolScopes, missingToolScope, requiredScopes, requiresScope } from "@/lib/tools/required-scopes";

const CAMPAIGN = "marketing.create_campaign";
const BOTH: Scope[] = ["marketing:write", "discounts:write"];

/** A real key plaintext; the mocked row hands back whatever `keyScopes` holds. */
const { plaintext } = generateApiKey();

beforeEach(() => {
  vi.clearAllMocks();
  authAttemptPerIpLimiter.reset();
  publicAgentPerIpLimiter.reset();
  prismaMock.apiKey.update.mockResolvedValue({});
  prismaMock.apiKey.findUnique.mockImplementation(async () => ({
    id: "key_1",
    userId: "user_1",
    keyHash: "x",
    scopes: JSON.stringify(keyScopes.value),
    revokedAt: null,
    expiresAt: null,
  }));
});

function withKey(scopes: string[]): void {
  keyScopes.value = scopes;
}

async function restCall(name: string, body: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/v1/tools/[name]/route");
  return POST(
    new NextRequest(`http://localhost:3000/api/v1/tools/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${plaintext}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ name }) },
  );
}

async function mcpInstructions(): Promise<string> {
  const { POST } = await import("@/app/api/mcp/route");
  const response = await POST(
    new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${plaintext}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
      }),
    }),
  );
  expect(response.status).toBe(200);
  const body = JSON.parse(await response.text()) as { result: { instructions: string } };
  return body.result.instructions;
}

async function mcpToolNames(): Promise<string[]> {
  const { POST } = await import("@/app/api/mcp/route");
  const response = await POST(
    new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${plaintext}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
  );
  expect(response.status).toBe(200);
  const body = JSON.parse(await response.text()) as { result?: { tools: { name: string }[] }; error?: unknown };
  expect(body.error).toBeUndefined();
  return body.result!.tools.map((tool) => tool.name);
}

describe("the definition", () => {
  it("marketing.create_campaign needs discounts:write on top of marketing:write", () => {
    const tool = getTool(CAMPAIGN)!;
    expect(tool.scope).toBe("marketing:write");
    expect(requiredScopes(tool)).toEqual(BOTH);
  });

  it("every extra scope is a real scope, distinct from the tool's own and from each other", () => {
    for (const tool of listTools()) {
      const extra = tool.extraScopes ?? [];
      for (const scope of extra) expect(isValidScope(scope), `${tool.name} -> ${scope}`).toBe(true);
      expect(new Set([tool.scope, ...extra]).size, tool.name).toBe(extra.length + 1);
    }
  });

  it("the helpers name the first scope a key lacks", () => {
    const tool = getTool(CAMPAIGN)!;
    expect(missingToolScope(["marketing:write"], tool)).toBe("discounts:write");
    expect(missingToolScope(["discounts:write"], tool)).toBe("marketing:write");
    expect(missingToolScope(BOTH, tool)).toBeNull();
    expect(hasToolScopes(["marketing:*", "discounts:*"], tool)).toBe(true);
  });
});

describe("enforcement: the registry", () => {
  const ctx = { actor: "system:test" as never };

  it("a key with marketing:write alone gets 403 naming discounts:write", async () => {
    const result = await invokeTool(CAMPAIGN, {}, ctx, ["marketing:write"]);
    expect(result).toMatchObject({ ok: false, status: 403, error: `Tool '${CAMPAIGN}' requires scope: discounts:write` });
  });

  it("with both scopes the scope gate passes (and validation answers)", async () => {
    const result = await invokeTool(CAMPAIGN, {}, ctx, BOTH);
    expect(result).toMatchObject({ ok: false, status: 422 });
  });
});

describe("enforcement: REST POST /api/v1/tools/<name>", () => {
  it("a key with marketing:write alone gets 403 insufficient_scope naming discounts:write", async () => {
    withKey(["marketing:write"]);
    const response = await restCall(CAMPAIGN, {});
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("insufficient_scope");
    expect(body.detail).toBe("API key missing required scope: discounts:write");
  });

  it("a key with discounts:write alone is refused on the primary scope", async () => {
    withKey(["discounts:write"]);
    const response = await restCall(CAMPAIGN, {});
    expect(response.status).toBe(403);
    expect((await response.json()).detail).toBe("API key missing required scope: marketing:write");
  });

  it("a key with both passes the scope gates and reaches validation", async () => {
    withKey(BOTH);
    const response = await restCall(CAMPAIGN, {});
    expect(response.status).toBe(422);
  });

  it("requireApiScope still takes a single scope as before", async () => {
    withKey(["marketing:write"]);
    const request = new Request("http://localhost/x", { headers: { authorization: `Bearer ${plaintext}` } });
    expect(await requireApiScope(request, "marketing:write")).toHaveProperty("actor");
    expect(await requireApiScope(request, ["marketing:write", "discounts:write"])).toMatchObject({
      error: { status: 403, body: { error: "API key missing required scope: discounts:write" } },
    });
  });
});

describe("enforcement: MCP tools/list", () => {
  // catalog:read rides along so the key always holds at least one tool: an MCP
  // server with none registered has no tools/list method to answer with.
  it("a key with marketing:write (and no discounts:write) does not see the campaign tool", async () => {
    withKey(["catalog:read", "marketing:write"]);
    const names = await mcpToolNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain(CAMPAIGN);
  });

  it("a key with both scopes sees it", async () => {
    withKey(["catalog:read", ...BOTH]);
    expect(await mcpToolNames()).toContain(CAMPAIGN);
  });

  it("the server instructions recommend the campaign tool only to a key that is shown it", async () => {
    withKey(["catalog:read", "marketing:write"]);
    expect(await mcpInstructions()).not.toContain(CAMPAIGN);
    withKey(["catalog:read", ...BOTH]);
    expect(await mcpInstructions()).toContain(`Use ${CAMPAIGN} to create a discount code`);
  });
});

describe("listing: every document that states a tool's scope also states its extra scopes", () => {
  it("the manifest", () => {
    const manifest = buildToolManifest();
    expect(manifest.find((tool) => tool.name === CAMPAIGN)).toMatchObject({
      scope: "marketing:write",
      extraScopes: ["discounts:write"],
    });
    const plain = manifest.find((tool) => tool.name === "discounts.create")!;
    expect(plain).not.toHaveProperty("extraScopes");
  });

  it("GET /api/v1/tools (compact and ?schema=true)", async () => {
    const { GET } = await import("@/app/api/v1/tools/route");
    for (const url of ["http://localhost:3000/api/v1/tools", "http://localhost:3000/api/v1/tools?schema=true"]) {
      const { tools } = (await (await GET(new NextRequest(url))).json()) as {
        tools: { name: string; extraScopes?: string[] }[];
      };
      expect(tools.find((tool) => tool.name === CAMPAIGN)?.extraScopes, url).toEqual(["discounts:write"]);
      expect(tools.find((tool) => tool.name === "discounts.create"), url).not.toHaveProperty("extraScopes");
    }
  });

  it("GET /api/v1/tools/<name>", async () => {
    const { GET } = await import("@/app/api/v1/tools/[name]/route");
    const response = await GET(new NextRequest(`http://localhost:3000/api/v1/tools/${CAMPAIGN}`), {
      params: Promise.resolve({ name: CAMPAIGN }),
    });
    expect(await response.json()).toMatchObject({ scope: "marketing:write", extraScopes: ["discounts:write"] });
  });

  it("the OpenAPI operation", async () => {
    const { GET } = await import("@/app/openapi.json/route");
    const document = (await (await GET()).json()) as {
      paths: Record<string, { post: Record<string, unknown> }>;
    };
    const campaign = document.paths[`/api/v1/tools/${CAMPAIGN}`].post;
    expect(campaign["x-cartwright-required-scope"]).toBe("marketing:write");
    expect(campaign["x-cartwright-extra-scopes"]).toEqual(["discounts:write"]);
    expect(document.paths["/api/v1/tools/discounts.create"].post).not.toHaveProperty("x-cartwright-extra-scopes");
  });
});

describe("GET /api/v1/tools?scope= lists the tools that require the scope, primary or extra", () => {
  type Listed = { name: string; scope: string; extraScopes?: string[] };

  async function catalogue(query: string): Promise<{ count: number; tools: Listed[] }> {
    const { GET } = await import("@/app/api/v1/tools/route");
    const response = await GET(new NextRequest(`http://localhost:3000/api/v1/tools${query}`));
    expect(response.status, query).toBe(200);
    return (await response.json()) as { count: number; tools: Listed[] };
  }

  /** Both forms of the catalogue, so the compact list and ?schema=true can never disagree. */
  async function both(scope: string): Promise<{ query: string; count: number; tools: Listed[] }[]> {
    const encoded = encodeURIComponent(scope);
    return Promise.all(
      [`?scope=${encoded}`, `?scope=${encoded}&schema=true`].map(async (query) => ({ query, ...(await catalogue(query)) })),
    );
  }

  /** The names the registry itself says need `scope`, independent of the route. */
  function expected(scope: string): string[] {
    return listTools()
      .filter((tool) => tool.scope === scope || (tool.extraScopes ?? []).includes(scope as Scope))
      .map((tool) => tool.name)
      .sort();
  }

  it("the helper: a primary scope matches, an extra scope matches, anything else does not", () => {
    const tool = getTool(CAMPAIGN)!;
    expect(requiresScope(tool, "marketing:write")).toBe(true);
    expect(requiresScope(tool, "discounts:write")).toBe(true);
    expect(requiresScope(tool, "discounts:read")).toBe(false);
    expect(requiresScope(tool, "marketing:*")).toBe(false);
    expect(requiresScope(tool, "")).toBe(false);
  });

  it("primary match: ?scope=marketing:write lists the campaign tool", async () => {
    for (const { query, count, tools } of await both("marketing:write")) {
      const names = tools.map((tool) => tool.name);
      expect(names, query).toContain(CAMPAIGN);
      expect(names.sort(), query).toEqual(expected("marketing:write"));
      expect(count, query).toBe(tools.length);
    }
  });

  it("extra match: ?scope=discounts:write lists the campaign tool beside the discount tools", async () => {
    for (const { query, count, tools } of await both("discounts:write")) {
      const names = tools.map((tool) => tool.name);
      expect(names, query).toContain(CAMPAIGN);
      expect(names, query).toContain("discounts.create");
      expect(names.sort(), query).toEqual(expected("discounts:write"));
      expect(count, query).toBe(tools.length);
      // The listed entry still says which scope is primary and which is extra.
      expect(tools.find((tool) => tool.name === CAMPAIGN), query).toMatchObject({
        scope: "marketing:write",
        extraScopes: ["discounts:write"],
      });
    }
  });

  it("no match: a scope the campaign tool does not need leaves it out, and every listed tool needs that scope", async () => {
    for (const { query, tools } of await both("discounts:read")) {
      expect(tools.map((tool) => tool.name), query).not.toContain(CAMPAIGN);
      for (const tool of tools) {
        expect(requiredScopes(tool as never), `${query} ${tool.name}`).toContain("discounts:read");
      }
    }
    for (const { query, count, tools } of await both("nope:nothing")) {
      expect(tools, query).toEqual([]);
      expect(count, query).toBe(0);
    }
    // Exact match only: no wildcard coverage, no case folding, no trimming.
    for (const scope of ["marketing:*", "*", "Discounts:Write", " discounts:write"]) {
      for (const { query, count } of await both(scope)) expect(count, query).toBe(0);
    }
  });

  it("without ?scope= every tool is listed, as before", async () => {
    const { count, tools } = await catalogue("");
    expect(count).toBe(listTools().length);
    expect(tools).toHaveLength(listTools().length);
    expect((await catalogue("?schema=true")).count).toBe(listTools().length);
  });
});
