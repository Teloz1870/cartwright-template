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
    url: "https://shop.example",
    metadata: { description: "An example shop." },
    features: { componentRegistryPublic: false } as {
      componentRegistryPublic?: boolean;
    },
  },
}));

vi.mock("@/brand.config", () => ({ brand: mocks.brand }));
vi.mock("@/lib/brand", () => ({ getFeatures: async () => mocks.features }));

import * as route from "@/app/.well-known/mcp.json/route";

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
  mocks.brand.url = "https://shop.example";
  mocks.brand.metadata = { description: "An example shop." };
  mocks.brand.features = { componentRegistryPublic: false };
});

describe("GET /.well-known/mcp.json — gate + caching contract", () => {
  it("is served force-dynamic so the DB-merged mcpPublic flag is honored", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("404s not_found when mcpPublic is off (no dead public references)", async () => {
    mocks.features = { mcpPublic: false };
    const res = await route.GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
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
      { url: "https://shop.example/api/mcp", transport: "streamable-http" },
    ]);
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
    // The only _meta key on the default path is the tool catalog.
    expect(Object.keys(meta)).toEqual(["cartwright/toolCatalog"]);
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
