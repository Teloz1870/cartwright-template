import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /.well-known/ucp — the Universal Commerce Protocol *Capability Profile*: the
 * structured-JSON discovery surface Google Gemini / OpenAI read to learn what
 * agentic-commerce operations a Cartwright shop actually supports. It is the
 * machine-readable twin of the prose in llms.txt (covered by llms-txt.test.ts).
 *
 * The one invariant that matters (charter P3 — the agentic moat): a capability
 * is advertised IF AND ONLY IF its underlying feature flag is actually on. The
 * route composes `capabilities[]` + `governance` purely from `getBrand()` — so a
 * flag-read regression here would either (a) advertise a capability whose
 * endpoints 404 (the ACP dual-gate drift class the backlog flags), or (b) drop a
 * capability the shop really supports. This table locks each gate, including the
 * compound `acp && merchantFeed → native_commerce` gate, in both directions.
 *
 * Test-only / additive / no storefront-or-identity file touched →
 * byte-identical.
 */

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
// oauth.ts imports `@/lib/db` at module scope (never called here); stub it so
// importing the REAL SUPPORTED_SCOPES / SCOPE_POLICIES consts stays hermetic.
vi.mock("@/lib/db", () => ({ prisma: {} }));

// The real scope constants — asserting identity_linking against these locks the
// route's scope wiring to the actual OAuth server's offered scopes/policies.
import { SUPPORTED_SCOPES, SCOPE_POLICIES } from "@/lib/ucp/oauth";

type Features = Record<string, boolean>;

function makeBrand(features: Features = {}, over: { domain?: string; storeName?: string } = {}) {
  return {
    storeName: over.storeName ?? "Test Shop",
    domain: "domain" in over ? over.domain : "shop.example",
    url: "https://shop.example",
    metadata: { description: "A test shop" },
    policies: { currency: "DKK", country: "DK" },
    ecommerceEnabled: false,
    features: {
      mcpPublic: false,
      acp: false,
      merchantFeed: false,
      ucpIdentityLinking: false,
      a2a: false,
      ...features,
    },
  };
}

type Ucp = {
  $schema: string;
  merchant: { name: string; domain: string; baseCurrency: string; supportedLocales: string[] };
  capabilities: Array<Record<string, unknown>>;
  governance: Record<string, unknown>;
  resources: Record<string, string>;
};

async function renderUcp(features: Features = {}, over = {}): Promise<Ucp> {
  vi.resetModules();
  mocks.getBrand.mockResolvedValue(makeBrand(features, over));
  const { GET } = await import("@/app/.well-known/ucp/route");
  const res = await GET();
  return (await res.json()) as Ucp;
}

const typesOf = (u: Ucp) => u.capabilities.map((c) => c.type);

beforeEach(() => {
  mocks.getBrand.mockReset();
});

describe("UCP capability profile (/.well-known/ucp)", () => {
  it("all flags off (website-mode/Teloz baseline) → zero capabilities, no negotiation", async () => {
    const u = await renderUcp();
    expect(u.capabilities).toEqual([]);
    expect(u.governance.agent_negotiation).toBe(false);
    // The static spine is always present regardless of flags.
    expect(u.$schema).toContain("capability-profile");
    expect(u.governance.requires_human_override_on_payment).toBe(true);
    expect(u.governance.trust_framework).toBe("Cartwright Agentic Commerce V1");
    expect(u.resources).toEqual({ llms_txt: "/llms.txt", sitemap: "/sitemap.xml" });
  });

  it("merchant block reflects the resolved brand identity", async () => {
    const u = await renderUcp({}, { storeName: "Northbound", domain: "north.example" });
    expect(u.merchant).toEqual({
      name: "Northbound",
      domain: "north.example",
      baseCurrency: "DKK",
      supportedLocales: ["DK"],
    });
  });

  it("domain falls back to localhost:3000 when unset (never emits an empty domain)", async () => {
    const u = await renderUcp({}, { domain: "" });
    expect(u.merchant.domain).toBe("localhost:3000");
  });

  it("mcpPublic on → catalog_discovery advertised (and nothing else)", async () => {
    const u = await renderUcp({ mcpPublic: true });
    expect(typesOf(u)).toEqual(["catalog_discovery"]);
    const cap = u.capabilities[0];
    expect(cap.endpoint).toBe("/api/mcp");
    expect(cap.protocol).toBe("Model Context Protocol (MCP)");
  });

  it("acp on, merchantFeed off → conversational_checkout advertised but NOT native_commerce", async () => {
    const u = await renderUcp({ acp: true });
    expect(typesOf(u)).toContain("conversational_checkout");
    expect(typesOf(u)).not.toContain("native_commerce");
    const checkout = u.capabilities.find((c) => c.type === "conversational_checkout")!;
    expect(checkout.endpointPrefix).toBe("/api/v1/checkout");
    expect(checkout.authentication).toBe("Shared Payment Tokens");
  });

  it("merchantFeed on but acp off → native_commerce NOT advertised (compound gate needs BOTH)", async () => {
    const u = await renderUcp({ merchantFeed: true });
    expect(typesOf(u)).not.toContain("native_commerce");
    // merchantFeed alone advertises no capability at all.
    expect(u.capabilities).toEqual([]);
  });

  it("acp AND merchantFeed on → native_commerce advertised, pointing at the Google feed", async () => {
    const u = await renderUcp({ acp: true, merchantFeed: true });
    expect(typesOf(u)).toContain("conversational_checkout");
    expect(typesOf(u)).toContain("native_commerce");
    const nc = u.capabilities.find((c) => c.type === "native_commerce")!;
    expect(nc.feed).toBe("/feed/google.xml");
    expect(nc.protocol).toBe("Universal Commerce Protocol (UCP)");
  });

  it("ucpIdentityLinking on → identity_linking advertised with the real offered scopes/policies", async () => {
    const u = await renderUcp({ ucpIdentityLinking: true });
    const cap = u.capabilities.find((c) => c.type === "identity_linking");
    expect(cap).toBeDefined();
    expect(cap!.capability).toBe("dev.ucp.common.identity_linking");
    expect(cap!.authorizationServerMetadata).toBe("/.well-known/oauth-authorization-server");
    // config.scopes must mirror the OAuth server's actual SUPPORTED_SCOPES + SCOPE_POLICIES.
    const scopes = (cap!.config as { scopes: Record<string, { description: unknown }> }).scopes;
    expect(Object.keys(scopes).sort()).toEqual([...SUPPORTED_SCOPES].sort());
    for (const s of SUPPORTED_SCOPES) {
      expect(scopes[s].description).toEqual(SCOPE_POLICIES[s]);
    }
  });

  it("a2a on → governance.agent_negotiation true, but a2a adds NO capability entry (governance-only)", async () => {
    const u = await renderUcp({ a2a: true });
    expect(u.governance.agent_negotiation).toBe(true);
    expect(u.capabilities).toEqual([]);
  });

  it("all flags on → exactly the four capabilities, in declaration order, + negotiation on", async () => {
    const u = await renderUcp({
      mcpPublic: true,
      acp: true,
      merchantFeed: true,
      ucpIdentityLinking: true,
      a2a: true,
    });
    expect(typesOf(u)).toEqual([
      "catalog_discovery",
      "conversational_checkout",
      "native_commerce",
      "identity_linking",
    ]);
    expect(u.governance.agent_negotiation).toBe(true);
  });
});
