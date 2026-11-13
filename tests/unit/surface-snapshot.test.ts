import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { AnyTool } from "@/lib/tools/types";

/**
 * What a shop's agent surface holds, one JSON file per fixture (the modules
 * spec, sections 2 and 8). Run the file and read `$SURFACE_SNAPSHOT_DIR` (default:
 * <tmp>/cartwright-surface-snapshot). A PR that moves the surface quotes the
 * numbers.
 *
 * `served` is what `POST /api/mcp` answers `tools/list` with for a key holding
 * every scope, measured through the real route and the real MCP SDK. Nothing is
 * filtered yet, so it is the whole registry on every fixture, whatever the gates
 * say. `visible` is what `isVisible` would leave, sent through that same route:
 * no route reads it in this slice, so it is a forecast. `operate` is the same for
 * a caller in that class.
 *
 * The counts and the engine's own names are pinned in the engine only: a
 * customer's own tool must not turn their `pnpm test` red. The rest holds in every
 * scaffold: the engine's own suite runs this file on a checkout shaped like a
 * customer's to keep that true.
 */

const shop = vi.hoisted(() => ({ ecommerceEnabled: false, features: {} as Record<string, boolean> }));
/** While set, the route's `listTools()` answers with these tools alone: how a forecast gets its real bytes. */
const forecast = vi.hoisted(() => ({ only: null as ((tool: AnyTool) => boolean) | null }));

vi.mock("@/lib/brand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brand")>();
  const { brand } = await import("@/brand.config");
  return {
    ...actual,
    getBrand: async () => ({ ...brand, ...shop, source: "db" }),
    getFeatures: async () => shop.features,
    getFeatureGateState: async () => ({ available: true, features: shop.features }),
  };
});
vi.mock("@/lib/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth")>();
  const { SCOPES } = await import("@/lib/scopes");
  return {
    ...actual,
    authenticateApiKey: async () => ({
      actor: { type: "apikey", apiKeyId: "key_root", userId: "user_1", scopes: [...SCOPES] },
    }),
  };
});
vi.mock("@/lib/tools/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools/registry")>();
  return {
    ...actual,
    listTools: () => (forecast.only ? actual.listTools().filter(forecast.only) : actual.listTools()),
  };
});

import { ADMIN_TOOL_ALLOWLIST } from "@/lib/ai/admin-tools";
import { CUSTOMER_TOOL_ALLOWLIST } from "@/lib/ai/client";
import { authAttemptPerIpLimiter } from "@/lib/auth-attempt-rate-limit";
import { FEATURE_MANIFEST, type FeatureKey } from "@/lib/feature-flags/manifest";
import { publicAgentPerIpLimiter } from "@/lib/public-agent-rate-limit";
import { CUSTOMER_CHAT_SCOPES, hasScope, type Scope } from "@/lib/scopes";
import { isVisible, type SurfaceCaller } from "@/lib/surface/visible";
import { PUBLIC_AGENT_TOOL_NAMES } from "@/lib/tools/public";
import { buildToolManifest, getTool, invokeTool, listTools } from "@/lib/tools/registry";
import { isEngineCheckout } from "../helpers/claims";

const PLATFORM_ON: FeatureKey[] = ["mcpPublic", "containerQueries", "popoverApi", "viewTransitions"];
const STOREFRONT_ON: FeatureKey[] = ["aiStylist", "newsletter", "cartwrightBadge", "welcomeGuide"];

function featuresOn(...on: FeatureKey[]): Record<string, boolean> {
  return Object.fromEntries(FEATURE_MANIFEST.map((f) => [f.key, on.includes(f.key)]));
}

/** The flags are written out here and never read from brand.config, so a scaffold measures the same shops. */
const FIXTURES = {
  /** Website mode with the engine's default-on flags: the shape Teloz has. */
  "website-teloz-like": {
    ecommerceEnabled: false,
    features: featuresOn(...PLATFORM_ON, ...STOREFRONT_ON),
  },
  /** A webshop that has switched on nothing beyond the defaults. */
  "webshop-plain": {
    ecommerceEnabled: true,
    features: featuresOn(...PLATFORM_ON, ...STOREFRONT_ON, "webshop"),
  },
  /** Every flag on: the shape Solbrillen has. */
  "all-flags-on": {
    ecommerceEnabled: true,
    features: featuresOn(...FEATURE_MANIFEST.map((f) => f.key)),
  },
  /**
   * The commerce + blog profile section 2 lists for Hegnsfabrikken: its flags on,
   * newsletter, aiStylist and welcomeGuide false, the owner's own choices and the
   * temporary migration flag off. `opsLayer` is on that list too, and has no
   * entry here until a slice declares it.
   */
  "commerce-blog-hf-like": {
    ecommerceEnabled: true,
    features: featuresOn(
      ...PLATFORM_ON,
      "webshop",
      "orderWorkspace",
      "fulfillmentPdf",
      "shippingZones",
      "mediaLibrary",
      "merchantFeed",
      "blog",
      "breadcrumbs",
      "ownerOrderEmail",
    ),
  },
} as const;

type FixtureName = keyof typeof FIXTURES;
const FIXTURE_NAMES = Object.keys(FIXTURES) as FixtureName[];

const SNAPSHOT_DIR =
  process.env.SURFACE_SNAPSHOT_DIR ?? path.join(tmpdir(), "cartwright-surface-snapshot");

/** The key section 2 gives Hegnsfabrikken's operator. */
const OPERATOR_KEY_SCOPES: Scope[] = ["catalog:read", "categories:read", "orders:read", "orders:write", "customer:read"];

function use(name: FixtureName): void {
  shop.ecommerceEnabled = FIXTURES[name].ecommerceEnabled;
  shop.features = FIXTURES[name].features;
}

/** The body of `tools/list`, exactly as an MCP client receives it. */
async function toolsListBody({ anonymous = false } = {}): Promise<string> {
  const { POST } = await import("@/app/api/mcp/route");
  const response = await POST(
    new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(anonymous ? {} : { authorization: "Bearer sb_live_x" }),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
  );
  expect(response.status).toBe(200);
  return response.text();
}

async function toolsList(): Promise<{ tools: number; toolsListBytes: number }> {
  const raw = await toolsListBody();
  const body = JSON.parse(raw) as { result: { tools: unknown[] } };
  return { tools: body.result.tools.length, toolsListBytes: Buffer.byteLength(raw) };
}

/** `tools/list` as it would read with only this caller's visible tools registered. */
async function toolsListForecast(caller?: SurfaceCaller): ReturnType<typeof toolsList> {
  forecast.only = (tool) => isVisible(tool, shop, caller);
  try {
    return await toolsList();
  } finally {
    forecast.only = null;
  }
}

/** The numbers section 2 states, on the fixture in use. */
function counts() {
  const visible = (caller?: SurfaceCaller) => listTools().filter((tool) => isVisible(tool, shop, caller));
  return {
    visible: visible().length,
    operate: visible({ surface: "operate" }).length,
    copilot: ADMIN_TOOL_ALLOWLIST.filter((name) => isVisible(getTool(name) ?? {}, shop)).length,
    operatorKey: visible({ surface: "operate" }).filter((tool) => hasScope(OPERATOR_KEY_SCOPES, tool.scope)).length,
  };
}

function writeSnapshot(name: FixtureName, snapshot: Record<string, unknown>): void {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(
    path.join(SNAPSHOT_DIR, `${name}.json`),
    `${JSON.stringify({ fixture: name, ...snapshot }, null, 2)}\n`,
  );
}

describe("the agent surface, per fixture", () => {
  beforeEach(() => authAttemptPerIpLimiter.reset());

  it.each(FIXTURE_NAMES)("%s: tools/list serves the whole registry; the gates only forecast", async (name) => {
    use(name);
    const served = await toolsList();
    const visible = await toolsListForecast();
    const operate = await toolsListForecast({ surface: "operate" });
    const { copilot, operatorKey } = counts();
    writeSnapshot(name, {
      served,
      visible,
      operate,
      copilot,
      operatorKey,
      storefrontChat: CUSTOMER_TOOL_ALLOWLIST.length,
    });

    expect(served.tools).toBe(listTools().length);
    expect(visible.tools).toBe(counts().visible);
    expect(operate.tools).toBe(counts().operate);
    expect(visible.toolsListBytes).toBeLessThan(served.toolsListBytes);
    expect(operate.toolsListBytes).toBeLessThan(visible.toolsListBytes);

    use("all-flags-on");
    expect(await toolsList()).toEqual(served);
  });

  /**
   * Section 2's counts on today's registry. Its table was measured on 89 tools; the
   * 6 `migration.*` tools since then sit behind `migrationDashboard`, so the
   * commerce + blog profile lands on the spec's 63, 41, 37 and 10 all the same.
   * Only `all-flags-on`, where that flag is on, reads 86 for the spec's ≈80.
   *
   * A new tool moves these: give it a gate if a flag or the shop's mode turns it
   * off, then write the new numbers here.
   */
  it.runIf(isEngineCheckout).each([
    ["website-teloz-like", { visible: 39, operate: 17, copilot: 20, operatorKey: 2 }],
    ["webshop-plain", { visible: 61, operate: 39, copilot: 38, operatorKey: 12 }],
    ["all-flags-on", { visible: 88, operate: 58, copilot: 47, operatorKey: 14 }],
    ["commerce-blog-hf-like", { visible: 65, operate: 43, copilot: 38, operatorKey: 12 }],
  ] as const)("%s: the counts", (name, expected) => {
    use(name);
    expect(counts()).toEqual(expected);
  });

  it.runIf(isEngineCheckout)("the migration flag adds its 6 tools to the commerce + blog profile", () => {
    use("commerce-blog-hf-like");
    const { visible } = counts();
    shop.features = { ...shop.features, migrationDashboard: true };
    expect(counts().visible).toBe(visible + 6);
  });
});

describe("nothing is filtered yet", () => {
  it("listTools, the manifest and getTool hold every tool, the hidden ones included", () => {
    use("website-teloz-like");
    const hidden = listTools().filter((tool) => !isVisible(tool, shop));
    expect(hidden.length).toBeGreaterThan(0);
    expect(buildToolManifest().map((tool) => tool.name)).toEqual(listTools().map((tool) => tool.name));
    for (const tool of hidden) expect(getTool(tool.name), tool.name).toBe(tool);
  });

  it("a tool the gates hide still dispatches: bad arguments get a 422, not the 404 of a tool that is gone", async () => {
    use("website-teloz-like");
    expect(isVisible(getTool("cart.add") ?? {}, shop)).toBe(false);
    const result = await invokeTool("cart.add", {}, { actor: "system:public-agent" }, CUSTOMER_CHAT_SCOPES);
    expect(result).toMatchObject({ ok: false, status: 422 });
  });
});

describe("the storefront chat keeps its tools", () => {
  it.runIf(isEngineCheckout)("its 13 tools are these", () => {
    expect([...CUSTOMER_TOOL_ALLOWLIST].sort()).toEqual([
      "address.autocomplete",
      "cart.add",
      "cart.get_summary",
      "cart.remove",
      "cart.update_quantity",
      "discounts.try_apply",
      "orders.create",
      "products.get",
      "products.search",
      "ui.present_products",
      "user.get_last_shipping",
    ]);
  });

  it("every tool in its allowlist resolves on every shop", () => {
    for (const name of FIXTURE_NAMES) {
      use(name);
      expect(CUSTOMER_TOOL_ALLOWLIST.filter((tool) => !getTool(tool)), name).toEqual([]);
    }
  });

  const surfaceOf = (name: string) => getTool(name)?.gate?.surface;

  it("neither the copilot nor an anonymous caller reaches a storefront tool", () => {
    expect(ADMIN_TOOL_ALLOWLIST.filter((name) => surfaceOf(name) === "storefront")).toEqual([]);
    expect(PUBLIC_AGENT_TOOL_NAMES.filter((name) => surfaceOf(name) === "storefront")).toEqual([]);
  });

  it.runIf(isEngineCheckout)("the engine's anonymous tools carry no class to narrow them", () => {
    expect(PUBLIC_AGENT_TOOL_NAMES.filter((name) => surfaceOf(name) !== undefined)).toEqual([]);
  });
});

describe("a gate is never published", () => {
  beforeEach(() => {
    authAttemptPerIpLimiter.reset();
    publicAgentPerIpLimiter.reset();
  });

  /** Every key a tool entry carries in a document, across all its entries. */
  function keysOf(entries: object[]): string[] {
    expect(entries.length).toBeGreaterThan(0);
    return [...new Set(entries.flatMap((entry) => Object.keys(entry)))].sort();
  }

  const CATALOGUE_KEYS = ["anonymous", "description", "name", "revertible", "scope", "security"];
  const MCP_KEYS = ["annotations", "description", "execution", "inputSchema", "name", "outputSchema"];

  it("every document a shop publishes gives a tool the keys it always had, and no others", async () => {
    use("all-flags-on");
    expect(listTools().filter((tool) => tool.gate).length).toBeGreaterThan(0);

    const catalogue = await import("@/app/api/v1/tools/route");
    const compact = await catalogue.GET(new NextRequest("http://localhost:3000/api/v1/tools"));
    expect(keysOf((await compact.json()).tools)).toEqual(CATALOGUE_KEYS);

    const verbose = await catalogue.GET(new NextRequest("http://localhost:3000/api/v1/tools?schema=true"));
    expect(keysOf((await verbose.json()).tools)).toEqual(
      [...CATALOGUE_KEYS, "examples", "inputJsonSchema", "outputJsonSchema"].sort(),
    );

    const single = await import("@/app/api/v1/tools/[name]/route");
    const each = await Promise.all(
      listTools().map(async ({ name }) => {
        const url = `http://localhost:3000/api/v1/tools/${name}`;
        return (await single.GET(new NextRequest(url), { params: Promise.resolve({ name }) })).json();
      }),
    );
    expect(keysOf(each)).toEqual(["description", "name", "revertible", "scope"]);

    expect(keysOf(JSON.parse(await toolsListBody()).result.tools)).toEqual(MCP_KEYS);
    expect(keysOf(JSON.parse(await toolsListBody({ anonymous: true })).result.tools)).toEqual(MCP_KEYS);

    const card = await import("@/app/.well-known/mcp.json/route");
    expect(keysOf((await (await card.GET()).json()).tools)).toEqual(["description", "inputSchema", "name", "readOnly"]);

    const openapi = await import("@/app/openapi.json/route");
    const { paths } = (await (await openapi.GET()).json()) as { paths: Record<string, { post: object }> };
    const operations = Object.entries(paths).filter(([route]) => route.startsWith("/api/v1/tools/"));
    expect(keysOf(operations.map(([, path]) => path.post))).toEqual([
      "description",
      "operationId",
      "requestBody",
      "responses",
      "security",
      "summary",
      "tags",
      "x-cartwright-anonymous-read",
      "x-cartwright-required-scope",
      "x-examples",
    ]);
  });

  it("the manifest the documents are built from has no gate either", () => {
    expect(keysOf(buildToolManifest())).toEqual([
      "description",
      "examples",
      "inputJsonSchema",
      "name",
      "outputJsonSchema",
      "revertible",
      "scope",
    ]);
  });
});
