import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  isAllowedMcpOrigin,
  mcpAllowedOrigins,
  mcpForbiddenOriginResponse,
} from "@/lib/mcp/origin";

/**
 * DNS-rebinding protection on `/api/mcp`.
 *
 * The Streamable HTTP transport specification requires the server to validate the
 * `Origin` header on all incoming connections and answer `403` when it is present
 * and not allowed. Two things are locked here, because both are easy to regress
 * into something that looks fine:
 *
 * 1. **The allowlist is anchored to configuration, never to the request.** In a
 *    DNS-rebinding attack the attacker's page carries its own `Origin` while the
 *    `Host` header already matches the target, so any rule that compares the two
 *    validates the attack instead of blocking it.
 * 2. **The `mcpPublic` gate answers before the origin check.** A shop with the
 *    surface off must return the same `404` to every caller; a `403` reaching a
 *    foreign origin first would let a scanner tell "turned off" apart from
 *    "never existed", which is the property that gate exists to provide.
 *
 * Route-level cases mock only the seams (`@/brand.config`, `@/lib/brand`,
 * registry, api-auth, the MCP SDK) and run the REAL route handlers against the
 * REAL guard.
 *
 * `@/brand.config` is mocked for the same reason its sibling
 * `mcp-json-route.test.ts` mocks it: this suite ships to every scaffold, and
 * `brand.url` is the first field a shop changes. Pinning the real value would
 * make routine branding turn `pnpm test` red on correct behaviour — and it
 * already would on both demo canaries.
 */

const SHOP_ORIGIN = "https://shop.example";

const { getFeaturesMock, getBrandMock, registryMock, apiAuthMock, brandMock } = vi.hoisted(() => ({
  brandMock: {
    storeSlug: "example-shop",
    storeName: "Example Shop",
    url: "https://shop.example",
  },
  getFeaturesMock: vi.fn(),
  getBrandMock: vi.fn(),
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

vi.mock("@/brand.config", () => ({ brand: brandMock }));
vi.mock("@/lib/brand", () => ({ getFeatures: getFeaturesMock, getBrand: getBrandMock }));
vi.mock("@/lib/tools/registry", () => registryMock);
vi.mock("@/lib/api-auth", () => apiAuthMock);
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
        return Response.json({ transport: "streamable-http" }, { status: 200 });
      }
    },
  }),
);

function mcpRequest(
  init: { method?: string; origin?: string | null; auth?: boolean } = {},
) {
  const method = init.method ?? "POST";
  const headers: Record<string, string> = {};
  if (init.auth !== false) headers.authorization = "Bearer sb_live_x";
  if (init.origin != null) headers.origin = init.origin;
  return new NextRequest("http://localhost:3000/api/mcp", {
    method,
    headers,
    ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getFeaturesMock.mockResolvedValue({ mcpPublic: true });
  // Default: no wizard domain set, so the runtime URL equals the config one.
  getBrandMock.mockResolvedValue({
    url: `${SHOP_ORIGIN}/`,
    storeName: "Runtime Example Shop",
  });
  apiAuthMock.authenticateApiKey.mockResolvedValue({
    actor: { type: "apikey", apiKeyId: "key_1", userId: "u_1", scopes: [] },
  });
});

describe("isAllowedMcpOrigin — the allowlist itself", () => {
  const allowed = [SHOP_ORIGIN];
  const call = (header: string | null | undefined) =>
    isAllowedMcpOrigin(header, { allowed, allowLoopback: false });

  it("allows an ABSENT header — every non-browser MCP client sends none", () => {
    expect(call(null)).toBe(true);
    expect(call(undefined)).toBe(true);
  });

  it("allows a present-but-empty header (a stripping proxy, never a browser)", () => {
    expect(call("")).toBe(true);
    expect(call("   ")).toBe(true);
  });

  it("allows the shop's own origin, case- and trailing-slash-insensitively", () => {
    expect(call(SHOP_ORIGIN)).toBe(true);
    expect(call("https://SHOP.EXAMPLE")).toBe(true);
    expect(call("https://shop.example/")).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(call("https://evil.example")).toBe(false);
  });

  it("rejects a foreign origin that merely PREFIXES/SUFFIXES the allowed one", () => {
    // A substring rule would pass all three of these.
    expect(call("https://shop.example.evil.example")).toBe(false);
    expect(call("https://evil-shop.example")).toBe(false);
    expect(call("https://shop.example:8443")).toBe(false); // port is part of the origin
  });

  it("rejects a scheme downgrade of the allowed origin", () => {
    expect(call("http://shop.example")).toBe(false);
  });

  it("rejects opaque and unparseable origins", () => {
    expect(call("null")).toBe(false); // sandboxed iframe
    expect(call("file:///Users/x/page.html")).toBe(false);
    expect(call("shop.example")).toBe(false); // no scheme
    expect(call("!!not a url!!")).toBe(false);
  });

  it("allows loopback ONLY when loopback is permitted (dev, not production)", () => {
    for (const dev of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
      expect(isAllowedMcpOrigin(dev, { allowed, allowLoopback: true })).toBe(true);
      expect(isAllowedMcpOrigin(dev, { allowed, allowLoopback: false })).toBe(false);
    }
  });

  it("does not treat a loopback-LOOKING hostname as loopback", () => {
    expect(
      isAllowedMcpOrigin("http://localhost.evil.example", { allowed, allowLoopback: true }),
    ).toBe(false);
  });

  it("the DEFAULT loopback rule is NODE_ENV — production refuses loopback", () => {
    // The cases above all pass `allowLoopback` explicitly, which leaves the one
    // security-relevant default in the module unpinned: a production build must
    // not accept `http://localhost` just because a dev build does.
    try {
      vi.stubEnv("NODE_ENV", "production");
      expect(isAllowedMcpOrigin("http://localhost:3000", { allowed })).toBe(false);
      expect(isAllowedMcpOrigin("http://127.0.0.1:3000", { allowed })).toBe(false);

      vi.stubEnv("NODE_ENV", "development");
      expect(isAllowedMcpOrigin("http://localhost:3000", { allowed })).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("mcpAllowedOrigins — what feeds the allowlist", () => {
  it("always contains the shop's own brand.url origin", () => {
    expect(mcpAllowedOrigins({})).toEqual([SHOP_ORIGIN]);
  });

  it("adds MCP_ALLOWED_ORIGINS entries, normalized and de-duplicated", () => {
    expect(
      mcpAllowedOrigins({
        MCP_ALLOWED_ORIGINS: " https://admin.example.com/ , https://ADMIN.example.com , https://b.example.com ",
      }),
    ).toEqual([SHOP_ORIGIN, "https://admin.example.com", "https://b.example.com"]);
  });

  it("drops unparseable entries instead of widening the list", () => {
    expect(mcpAllowedOrigins({ MCP_ALLOWED_ORIGINS: "not-a-url,,   ,*" })).toEqual([
      SHOP_ORIGIN,
    ]);
  });

  it("drops an UNPREFIXED entry whose origin is OPAQUE, so it cannot admit every opaque origin", () => {
    // `new URL("file:///x").origin` serializes to the literal string "null".
    // Kept in the list, that one entry would match EVERY sandboxed document and
    // local file — a single malformed entry silently disabling the whole check.
    const allowed = mcpAllowedOrigins({ MCP_ALLOWED_ORIGINS: "file:///Users/x/page.html" });
    expect(allowed).toEqual([SHOP_ORIGIN]);
    expect(
      isAllowedMcpOrigin("file:///Users/other/evil.html", { allowed, allowLoopback: false }),
    ).toBe(false);
  });
});

/**
 * The `opaque:` escape hatch.
 *
 * A browser extension with host permissions is exempt from CORS but still
 * attaches `Origin: chrome-extension://<id>` — an origin the URL specification
 * serializes as the string `"null"`, so the guard added in #420 rejects it and
 * the ordinary allowlist cannot take it back (see the case above: one stored
 * `"null"` would stand in for every sandboxed document at once).
 *
 * The prefix is what separates "name this one opaque origin" from "accept the
 * class". Every case below is written from that angle: what it admits, and —
 * more importantly — what a single entry must still leave shut.
 */
describe("mcpAllowedOrigins — the `opaque:` form", () => {
  const EXT = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
  const listed = (value: string) => mcpAllowedOrigins({ MCP_ALLOWED_ORIGINS: value });
  const admits = (allowed: string[], header: string) =>
    isAllowedMcpOrigin(header, { allowed, allowLoopback: false });

  it("admits the ONE extension origin it names", () => {
    const allowed = listed(`opaque:${EXT}`);
    expect(allowed).toEqual([SHOP_ORIGIN, EXT]);
    expect(admits(allowed, EXT)).toBe(true);
  });

  it("admits ONLY that one — not a sibling extension, not the class", () => {
    const allowed = listed(`opaque:${EXT}`);
    expect(admits(allowed, "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba")).toBe(false);
    expect(admits(allowed, "moz-extension://11111111-2222-3333-4444-555555555555")).toBe(false);
    // The two values the class collapses to. Neither may ride in on the entry.
    expect(admits(allowed, "null")).toBe(false);
    expect(admits(allowed, "file:///Users/x/page.html")).toBe(false);
  });

  it("drops the hostless forms — those are the ones that cannot be told apart", () => {
    // Each of these would, if kept, be a stand-in for a whole class rather than
    // one caller. `opaque:null` does not even parse.
    for (const entry of [
      "opaque:file:///Users/x/page.html",
      "opaque:data:text/html,x",
      "opaque:null",
      "opaque:chrome-extension://",
      "opaque:",
      "opaque:   ",
    ]) {
      expect(listed(entry)).toEqual([SHOP_ORIGIN]);
    }
  });

  it("drops an `opaque:` entry that names an ORDINARY origin — no second spelling", () => {
    // Accepting it would give https://admin.example.com two ways to be listed
    // and buy the operator nothing; the unprefixed form is the one that works.
    expect(listed("opaque:https://admin.example.com")).toEqual([SHOP_ORIGIN]);
    expect(listed("https://admin.example.com")).toEqual([SHOP_ORIGIN, "https://admin.example.com"]);
  });

  it("keeps path, query and fragment out of the stored origin", () => {
    expect(listed(`opaque:${EXT}/popup.html?x=1#f`)).toEqual([SHOP_ORIGIN, EXT]);
  });

  it("matches the extension id CASE-SENSITIVELY, because an opaque host is not lower-cased", () => {
    // Measured: `new URL("chrome-extension://ABC").host === "ABC"`, unlike a
    // domain, which the parser folds. Entry and header run through the same
    // function, so they agree — but an operator who retypes the id in the wrong
    // case gets a 403, not a silent match.
    const allowed = listed("opaque:chrome-extension://ABCdef");
    expect(allowed).toEqual([SHOP_ORIGIN, "chrome-extension://ABCdef"]);
    expect(admits(allowed, "chrome-extension://ABCdef")).toBe(true);
    expect(admits(allowed, "chrome-extension://abcdef")).toBe(false);
  });

  it("an opaque origin can never reach the loopback hatch", () => {
    // `new URL("chrome-extension://localhost").hostname` is "localhost". A
    // hostname-only loopback rule would hand EVERY unlisted extension a pass on
    // every non-production build — so the scheme is part of that test.
    for (const header of ["chrome-extension://localhost", "app://127.0.0.1"]) {
      expect(isAllowedMcpOrigin(header, { allowed: [SHOP_ORIGIN], allowLoopback: true })).toBe(
        false,
      );
    }
  });

  it("changes nothing when no `opaque:` entry is present", () => {
    // The default every canary and every scaffold runs on.
    expect(mcpAllowedOrigins({})).toEqual([SHOP_ORIGIN]);
    expect(admits([SHOP_ORIGIN], EXT)).toBe(false);
    expect(admits([SHOP_ORIGIN], "null")).toBe(false);
    expect(admits([SHOP_ORIGIN], SHOP_ORIGIN)).toBe(true);
  });
});

describe("mcpForbiddenOriginResponse — the shape of the rejection", () => {
  it("is a 403 JSON-RPC error with NO id and no echo of the input", async () => {
    const res = mcpForbiddenOriginResponse();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid Origin header" },
    });
    // `id` is absent, not null — the spec's shape for a pre-message rejection.
    expect("id" in body).toBe(false);
    expect(res.headers.get("vary")).toBe("Origin");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/api/mcp — the guard in front of every verb", () => {
  it("POST with a foreign Origin is 403 and never reaches auth or the transport", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: "https://evil.example" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: -32000 } });
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
    expect(registryMock.listTools).not.toHaveBeenCalled();
  });

  it("POST with NO Origin still reaches the transport (the untouched default path)", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ transport: "streamable-http" });
    expect(apiAuthMock.authenticateApiKey).toHaveBeenCalledTimes(1);
  });

  it("POST with the shop's own Origin reaches the transport", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: SHOP_ORIGIN }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ transport: "streamable-http" });
  });

  it("DELETE with a foreign Origin is 403", async () => {
    const { DELETE } = await import("@/app/api/mcp/route");
    const res = await DELETE(mcpRequest({ method: "DELETE", origin: "https://evil.example" }));

    expect(res.status).toBe(403);
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
  });

  it("the unauthenticated GET intro — which never reaches the transport — is guarded too", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    const res = await GET(
      mcpRequest({ method: "GET", auth: false, origin: "https://evil.example" }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: -32000 } });
    // The intro's own fields must not leak past the rejection.
    expect(body).not.toHaveProperty("howToConnect");
  });

  it("the GET intro still answers 200 when no Origin is present", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    const res = await GET(mcpRequest({ method: "GET", auth: false }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.about).toContain("Runtime Example Shop");
    expect(
      body.howToConnect.clientConfig.mcpServers[brandMock.storeSlug].url,
    ).toBe(`${SHOP_ORIGIN}/api/mcp`);
  });

  it("mcpPublic OFF answers 404 EVEN to a foreign origin — off stays indistinguishable from absent", async () => {
    getFeaturesMock.mockResolvedValue({ mcpPublic: false });
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: "https://evil.example" }));

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/api/mcp",
    });
  });
});

describe("/api/mcp — the shop's RUNTIME origin (the setup wizard's domain)", () => {
  const WIZARD_ORIGIN = "https://wizard.example";

  it("accepts the domain set in the wizard, which brand.config knows nothing about", async () => {
    // getBrand() derives `url` from BrandingSettings.domain — the same value
    // sitemap/robots/canonical follow. A shop set up that way must not have to
    // repeat its own domain in an env var to be allowed to talk to itself.
    getBrandMock.mockResolvedValue({ url: `${WIZARD_ORIGIN}/` });
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: WIZARD_ORIGIN }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ transport: "streamable-http" });
  });

  it("still rejects a foreign origin once the runtime value has been consulted", async () => {
    getBrandMock.mockResolvedValue({ url: WIZARD_ORIGIN });
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: "https://evil.example" }));

    expect(res.status).toBe(403);
  });

  // NB: these two pin that the ORIGIN CHECK adds no brand read of its own — not
  // that no brand read happens. In production the mcpPublic gate ahead of it
  // already calls getFeatures(), which is `(await getBrand()).features`; the
  // mock below substitutes getFeatures separately, which severs that edge.
  it("the origin check itself does not read the brand when no Origin is present", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest());

    expect(res.status).toBe(200);
    // One read registers runtime-resolved public resources; the origin guard
    // itself performs no additional brand lookup when Origin is absent.
    expect(getBrandMock).toHaveBeenCalledTimes(1);
  });

  it("the origin check itself does not read the brand when the static list hits", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: SHOP_ORIGIN }));

    expect(res.status).toBe(200);
    // One read registers runtime-resolved public resources; the static origin
    // match itself performs no additional runtime-brand lookup.
    expect(getBrandMock).toHaveBeenCalledTimes(1);
  });

  it("fails CLOSED when the brand cannot be read — an unreachable DB never widens the list", async () => {
    getBrandMock.mockRejectedValue(new Error("database unreachable"));
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: WIZARD_ORIGIN }));

    expect(res.status).toBe(403);
  });
});

describe("/api/mcp — the operator's escape hatch", () => {
  const ORIGINAL = process.env.MCP_ALLOWED_ORIGINS;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MCP_ALLOWED_ORIGINS;
    else process.env.MCP_ALLOWED_ORIGINS = ORIGINAL;
  });

  it("an origin listed in MCP_ALLOWED_ORIGINS is let through", async () => {
    process.env.MCP_ALLOWED_ORIGINS = "https://admin.example.com";
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: "https://admin.example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ transport: "streamable-http" });
  });

  it("an origin NOT listed is still rejected while the variable is set", async () => {
    process.env.MCP_ALLOWED_ORIGINS = "https://admin.example.com";
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: "https://evil.example" }));

    expect(res.status).toBe(403);
  });

  it("an `opaque:` entry lets that extension reach the transport", async () => {
    const ext = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
    process.env.MCP_ALLOWED_ORIGINS = `opaque:${ext}`;
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: ext }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ transport: "streamable-http" });
  });

  it("a DIFFERENT extension is still 403 while that entry is set", async () => {
    process.env.MCP_ALLOWED_ORIGINS =
      "opaque:chrome-extension://abcdefghijklmnopabcdefghijklmnop";
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(mcpRequest({ origin: "chrome-extension://evilevilevilevilevilevil" }));

    expect(res.status).toBe(403);
    // The runtime-brand fallback must not rescue an opaque origin either: it
    // compares against getBrand().url, which is never opaque.
    expect(await res.json()).toMatchObject({ error: { code: -32000 } });
  });
});

/**
 * `OPTIONS` used to be the one verb nothing in this file could reach: with no
 * export for it Next installs its own handler, which is not this route's code
 * and so never reaches `guard()`. A shop with `mcpPublic` off answered `404` on
 * GET/POST/DELETE and `204 Allow: DELETE, GET, HEAD, OPTIONS, POST` on OPTIONS
 * — the "turned off" vs "never existed" distinction the 404 exists to deny,
 * handed out on the one method nobody thinks to check.
 *
 * These cases pin the gated behaviour on both sides: the gate answers first,
 * and when it lets the caller through the reply is still the ordinary HTTP
 * `OPTIONS` answer — not a CORS preflight (this route allows no cross-origin
 * reads and must not begin to).
 */
describe("OPTIONS /api/mcp — the verb Next used to answer on its own", () => {
  it("mcpPublic OFF → the same 404 as every other verb, and no Allow header", async () => {
    getFeaturesMock.mockResolvedValue({ mcpPublic: false });
    const { OPTIONS } = await import("@/app/api/mcp/route");
    const res = await OPTIONS(mcpRequest({ method: "OPTIONS" }));

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 404,
      code: "agent_interface_not_found",
      instance: "/api/mcp",
    });
    // Both halves of the old answer leaked, at different grains: the `204`
    // said a route is mounted here at all (an absent path answers `404` to
    // `OPTIONS` too), and the `Allow` then named the verbs. Fixing only the
    // status would leave the second disclosure standing, hence the separate
    // assertion.
    expect(res.headers.get("allow")).toBeNull();
  });

  it("a foreign Origin is rejected on OPTIONS too", async () => {
    const { OPTIONS } = await import("@/app/api/mcp/route");
    const res = await OPTIONS(mcpRequest({ method: "OPTIONS", origin: "https://evil.example" }));

    expect(res.status).toBe(403);
  });

  // NB: this asserts what the HANDLER returns, which is not header-for-header
  // what a browser sees. `next.config.ts` sets `Cache-Control: no-cache,
  // must-revalidate` on this path in production, and Next appends a handler
  // header only when the name is unset — `vary` is exempt, so `Vary: Origin`
  // survives and `no-store` is dropped (measured on a production build; a fork
  // without that config rule gets `no-store` through). Pinning the handler's
  // own value is what keeps this response from depending on that config file.
  it("an admitted caller gets the plain 204 + Allow, uncacheable and Origin-varying", async () => {
    const { OPTIONS } = await import("@/app/api/mcp/route");
    const res = await OPTIONS(mcpRequest({ method: "OPTIONS", origin: SHOP_ORIGIN }));

    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("DELETE, GET, HEAD, OPTIONS, POST");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("vary")).toBe("Origin");
    // Not a preflight: no CORS grant may ride along on this response.
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("never enters the MCP transport — no key is authenticated for a metadata verb", async () => {
    const { OPTIONS } = await import("@/app/api/mcp/route");
    const res = await OPTIONS(mcpRequest({ method: "OPTIONS", auth: false }));

    expect(res.status).toBe(204);
    expect(apiAuthMock.authenticateApiKey).not.toHaveBeenCalled();
    expect(registryMock.listTools).not.toHaveBeenCalled();
  });

  it("Allow = the module's own verb exports + the HEAD the framework adds", async () => {
    // Guards the hand-written string against a fifth export: adding one without
    // extending ALLOWED_METHODS would leave the route advertising fewer methods
    // than it answers. Derived from the module rather than retyped, so it goes
    // red on the addition instead of quietly disagreeing.
    //
    // HEAD is the one member with no export behind it. Next implements it from
    // GET when a module exports GET and not HEAD (`autoImplementMethods`:
    // `methods.HEAD = handlers.GET`), so `HEAD /api/mcp` runs the gated GET
    // handler and belongs in `Allow` — while `Object.keys` will never show it.
    const HTTP_VERBS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
    const mod = await import("@/app/api/mcp/route");
    const exportedVerbs = Object.keys(mod).filter((key) => HTTP_VERBS.has(key));
    const res = await mod.OPTIONS(mcpRequest({ method: "OPTIONS" }));

    // Non-vacuous on both sides: a real set of exports, and the header equals
    // exactly that set plus HEAD — nothing invented, nothing dropped.
    expect(exportedVerbs.sort()).toEqual(["DELETE", "GET", "OPTIONS", "POST"]);
    expect(res.headers.get("allow")?.split(", ")).toEqual(
      [...exportedVerbs, "HEAD"].sort(),
    );
  });

  it("HEAD is not exported — it exists only because GET is (the reason Allow lists it)", async () => {
    // If someone ever exports HEAD explicitly, the assumption above stops
    // holding silently; this says so out loud.
    const mod = await import("@/app/api/mcp/route");

    expect("HEAD" in mod).toBe(false);
    expect("GET" in mod).toBe(true);
  });
});
