import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Moat regression — GET /.well-known/mcp.json (the MCP "Server Card").
 *
 * This is the discovery surface AI clients (Claude, ChatGPT, Cursor) read to
 * auto-discover a Cartwright shop's MCP server + transport (SEP-1649 / SEP-2127
 * draft). It is served `force-dynamic` (codex fold-in 2026-07-15: the card is
 * gated on the DB-merged `mcpPublic` flag, so a runtime toggle must take
 * effect — the CDN cache headers still shield it) with public CORS + 24 h
 * cache headers. The route was untested at the handler level: `llms-txt.test.ts` only asserts that
 * llms.txt LINKS to `/.well-known/mcp.json` (a string), never imports or calls
 * this GET — and `registry-stats.test.ts` toggles `componentRegistryPublic` for
 * a different surface. The seam this file covers (noted 2026-07-03, locked
 * here in #349):
 *
 *   1. the mcpPublic gate — flag off ⇒ 404 not_found (a server card pointing
 *      at 404-ing endpoints would be a publicly discoverable dead reference),
 *      and the route stays force-dynamic so the DB-merged flag is honored.
 *   2. The advertise-iff-flag moat invariant — the `_meta` block advertises the
 *      shadcn component registry (`cartwright/componentRegistry`) IFF
 *      `brand.features.componentRegistryPublic` is on. Default-false ⇒ every
 *      canary omits it (byte-identical baseline); flipping the flag is the ONLY
 *      thing that surfaces it. The stable `cartwright/toolCatalog` pointer is
 *      always present.
 *   3. The public-metadata headers (CORS `*`, cache-control, JSON content-type)
 *      that browser-based clients depend on.
 *
 * Only `@/brand.config` is mocked (the #347/#348 route-handler pattern), so the
 * assertions pin the real wiring.
 */

const mocks = vi.hoisted(() => ({
  features: { mcpPublic: true } as { mcpPublic?: boolean },
  brand: {
    storeName: "Example Shop",
    storeSlug: "example-shop",
    url: "https://shop.example",
    defaultLocale: "en",
    metadata: { description: "An example shop." },
    features: { componentRegistryPublic: false } as {
      componentRegistryPublic?: boolean;
    },
  },
  toolManifest: [
    "products.search",
    "products.get",
    "categories.list",
    "site.list_pages",
    "site.get_page",
  ].map((name) => ({
    name,
    description: `Public read-only operation for ${name}`,
    inputJsonSchema: { type: "object", properties: {} },
  })),
}));

vi.mock("@/lib/brand", () => ({
  getFeatures: async () => mocks.features,
  getBrand: async () => mocks.brand,
}));
vi.mock("@/lib/tools/registry", () => ({
  buildToolManifest: () => mocks.toolManifest,
}));

import * as route from "@/app/.well-known/mcp.json/route";
import * as modernRoute from "@/app/.well-known/mcp/route";
import * as modernCardRoute from "@/app/.well-known/mcp/server-card.json/route";

async function getCard(): Promise<{
  status: number;
  headers: Headers;
  raw: string;
  card: Record<string, unknown>;
}> {
  const res = await route.GET();
  const raw = await res.text();
  return { status: res.status, headers: res.headers, raw, card: JSON.parse(raw) };
}

beforeEach(() => {
  mocks.features = { mcpPublic: true };
  mocks.brand.storeName = "Example Shop";
  mocks.brand.url = "https://shop.example/";
  mocks.brand.defaultLocale = "en";
  mocks.brand.metadata = { description: "An example shop." };
  mocks.brand.features = { componentRegistryPublic: false };
});

describe("GET /.well-known/mcp.json — gate + caching contract", () => {
  it("serves the same gated card at modern well-known discovery paths", () => {
    expect(modernRoute.GET).toBe(route.GET);
    expect(modernRoute.OPTIONS).toBe(route.OPTIONS);
    expect(modernCardRoute.GET).toBe(route.GET);
    expect(modernCardRoute.OPTIONS).toBe(route.OPTIONS);
  });

  it("is served force-dynamic so the DB-merged mcpPublic flag is honored", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("404s not_found when mcpPublic is off (no dead public references)", async () => {
    mocks.features = { mcpPublic: false };
    const res = await route.GET();
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/.well-known/mcp.json",
    });
  });

  it("treats an ABSENT mcpPublic flag as off", async () => {
    mocks.features = {};
    const res = await route.GET();
    expect(res.status).toBe(404);
  });

  it("returns 200 with public-discovery headers (JSON, CORS *, 24h cache)", async () => {
    const { status, headers } = await getCard();
    expect(status).toBe(200);
    expect(headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(headers.get("access-control-allow-origin")).toBe("*");
    expect(headers.get("cache-control")).toBe(
      "public, max-age=86400, s-maxage=86400",
    );
  });

  it("emits pretty-printed (2-space) JSON", async () => {
    const { raw } = await getCard();
    // JSON.stringify(card, null, 2) — a minified regression would drop the indent.
    expect(raw).toContain('\n  "name"');
  });
});

describe("GET /.well-known/mcp.json — identity + transport", () => {
  it("mirrors brand identity into name/title/description/websiteUrl", async () => {
    mocks.brand.storeName = "Northbound Coffee";
    mocks.brand.url = "https://demo.cartwright.app";
    mocks.brand.metadata = { description: "Roasted to order." };
    const { card } = await getCard();
    expect(card.name).toBe("Northbound Coffee");
    expect(card.title).toBe("Northbound Coffee");
    expect(card.description).toBe("Roasted to order.");
    expect(card.websiteUrl).toBe("https://demo.cartwright.app");
  });

  it("advertises exactly one streamable-http remote at <url>/api/mcp", async () => {
    const { card } = await getCard();
    expect(card.remotes).toEqual([
      {
        url: "https://shop.example/api/mcp",
        transport: "streamable-http",
        authentication: {
          anonymous: "public read-only tools",
          bearer: "required for private data and all actions",
        },
      },
    ]);
  });

  it("publishes a scanner- and client-readable server card with public tools", async () => {
    const { card } = await getCard();
    expect(card.version).toBe("1.0.0");
    expect(card.serverUrl).toBe("https://shop.example/api/mcp");
    expect(card.transport).toBe("streamable-http");
    expect((card.tools as Array<{ name: string; readOnly: boolean }>)).toHaveLength(5);
    expect((card.tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual([
      "products.search",
      "products.get",
      "categories.list",
      "site.list_pages",
      "site.get_page",
    ]);
    expect((card.tools as Array<{ readOnly: boolean }>).every((tool) => tool.readOnly)).toBe(true);
    expect(card._meta).toMatchObject({
      "cartwright/apiCatalog": "https://shop.example/.well-known/api-catalog",
      "cartwright/agentSkills": "https://shop.example/.well-known/agent-skills/index.json",
    });
  });
});

/**
 * `OPTIONS` on the server card — the third and last place the #429 sweep
 * missed, and the one where the leak said the most.
 *
 * With no export, Next answered the verb itself (`autoImplementMethods`) as
 * framework code that never reaches the gate: `204 Allow: GET, HEAD, OPTIONS`
 * on a shop whose card GET returned 404. Because this is a *well-known* path,
 * a mounted route at it is itself the disclosure — "this host runs an MCP
 * server" — which is the exact inference the 404 exists to deny.
 */
describe("OPTIONS /.well-known/mcp.json — the verb Next used to answer on its own", () => {
  it("mcpPublic OFF → the same 404 as GET, and NO Allow header", async () => {
    mocks.features = { mcpPublic: false };
    const res = await route.OPTIONS();

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/.well-known/mcp.json",
    });
    expect(res.headers.get("allow")).toBeNull();
  });

  it("treats an ABSENT mcpPublic flag as off, exactly as GET does", async () => {
    mocks.features = {};
    const res = await route.OPTIONS();
    expect(res.status).toBe(404);
  });

  it("flag ON → the plain 204 + Allow Next used to send, uncacheable", async () => {
    const res = await route.OPTIONS();

    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("does NOT answer a CORS preflight — the card's `*` grant stays on GET only", async () => {
    // GET sends `Access-Control-Allow-Origin: *` because the card is public
    // metadata fetched cross-origin, but that is a SIMPLE GET needing no
    // preflight. Next's substitute never granted one either, so no preflight
    // has ever succeeded here and this change does not start granting them.
    // Asserted as a pair so the contrast is the test, not a comment.
    const preflight = await route.OPTIONS();
    const { headers: getHeaders } = await getCard();

    expect(getHeaders.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-methods")).toBeNull();
    expect(preflight.headers.get("access-control-allow-headers")).toBeNull();
  });

  it("Allow = the module's own verb exports + the HEAD the framework adds", async () => {
    // Derived, not retyped: a third verb export goes red here rather than
    // silently leaving the route advertising fewer methods than it answers.
    // HEAD has no export — Next implements it from GET — so it is added by hand
    // on the expectation side, which is the only place it can come from.
    const HTTP_VERBS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
    const exportedVerbs = Object.keys(route).filter((key) => HTTP_VERBS.has(key));
    const res = await route.OPTIONS();

    expect(exportedVerbs.sort()).toEqual(["GET", "OPTIONS"]);
    expect(res.headers.get("allow")?.split(", ")).toEqual(
      [...exportedVerbs, "HEAD"].sort(),
    );
    expect("HEAD" in route).toBe(false);
  });
});

describe("GET /.well-known/mcp.json — advertise-iff-flag moat invariant", () => {
  it("always points agents at the tool catalog", async () => {
    const { card } = await getCard();
    const meta = card._meta as Record<string, unknown>;
    expect(meta["cartwright/toolCatalog"]).toBe(
      "https://shop.example/api/v1/tools",
    );
  });

  it("OMITS cartwright/componentRegistry when componentRegistryPublic is off (default/byte-identical baseline)", async () => {
    const { card } = await getCard();
    const meta = card._meta as Record<string, unknown>;
    expect(meta).not.toHaveProperty("cartwright/componentRegistry");
    expect(Object.keys(meta)).toEqual([
      "cartwright/toolCatalog",
      "cartwright/openapi",
      "cartwright/developers",
      "cartwright/apiCatalog",
      "cartwright/agentSkills",
    ]);
  });

  it("ADVERTISES cartwright/componentRegistry at <url>/api/registry only when the flag is on", async () => {
    mocks.brand.features = { componentRegistryPublic: true };
    const { card } = await getCard();
    const meta = card._meta as Record<string, unknown>;
    expect(meta["cartwright/componentRegistry"]).toBe(
      "https://shop.example/api/registry",
    );
    // The stable pointer is still present alongside it.
    expect(meta["cartwright/toolCatalog"]).toBe(
      "https://shop.example/api/v1/tools",
    );
  });

  it("treats an ABSENT componentRegistryPublic flag as off (no registry key)", async () => {
    mocks.brand.features = {}; // flag not declared at all
    const { card } = await getCard();
    const meta = card._meta as Record<string, unknown>;
    expect(meta).not.toHaveProperty("cartwright/componentRegistry");
  });
});
