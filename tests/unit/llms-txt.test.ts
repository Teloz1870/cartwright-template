import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * llms.txt — the surface an AI agent reads FIRST when discovering a Cartwright
 * site. Two contracts under test:
 *
 *  1. Truth: agentic-commerce endpoint links (/api/acp/feed, the ACP checkout
 *     sessions, /api/agent-card) only appear when their flags (acp / a2a) are
 *     on — those routes 404 when the flags are off, so linking them dark would
 *     be a dead URL. (Same principle as the merchantFeed link.)
 *  2. Canary safety: with the flags OFF, the output is byte-identical to the
 *     flags-ON output minus exactly the gated lines — i.e. gating adds whole
 *     lines and nothing else (Teloz, all agentic flags off, sees none of it).
 */

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  getFeatureView: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/feature-flags/status", () => ({
  getFeatureView: mocks.getFeatureView,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    brandingSettings: { findUnique: mocks.findUnique },
    page: { findMany: mocks.findMany },
  },
}));

type Overrides = {
  ecommerceEnabled?: boolean;
  features?: Record<string, boolean>;
};

function makeBrand(overrides: Overrides = {}) {
  return {
    url: "https://shop.example",
    storeName: "Test Shop",
    defaultLocale: "en",
    locales: ["da", "en"],
    tagline: "A test shop",
    metadata: { description: "A test shop" },
    policies: { currency: "DKK", country: "DK" },
    ecommerceEnabled: overrides.ecommerceEnabled ?? false,
    features: {
      cartwrightBadge: false,
      merchantFeed: false,
      acp: false,
      a2a: false,
      componentRegistryPublic: false,
      magicBuilder: false,
      mcpPublic: true,
      sectionLayout: false,
      ...overrides.features,
    },
  };
}

async function renderLlmsTxt(overrides: Overrides = {}): Promise<string> {
  vi.resetModules();
  mocks.getBrand.mockResolvedValue(makeBrand(overrides));
  mocks.getFeatureView.mockResolvedValue({ features: [] });
  mocks.findUnique.mockResolvedValue(null);
  mocks.findMany.mockResolvedValue([]);
  const { GET } = await import("@/app/llms.txt/route");
  const res = await GET();
  return res.text();
}

beforeEach(() => {
  mocks.getBrand.mockReset();
  mocks.getFeatureView.mockReset();
  mocks.findUnique.mockReset();
  mocks.findMany.mockReset();
});

describe("llms.txt", () => {
  it("keeps the bare /llms.txt frontmatter-free, and adds frontmatter only in homepage-markdown form", async () => {
    vi.resetModules();
    mocks.getBrand.mockResolvedValue(makeBrand());
    mocks.getFeatureView.mockResolvedValue({ features: [] });
    mocks.findUnique.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/llms.txt/route");

    // Bare fetch: classic llms.txt shape — parsers (and the canary smoke's
    // heading read) see exactly what they always saw.
    const bare = await (await GET(new NextRequest("https://shop.example/llms.txt"))).text();
    expect(bare.startsWith("---\n")).toBe(false);
    expect(bare.startsWith("# ")).toBe(true);

    // Homepage form (Accept-negotiated "/" or /index.md): YAML frontmatter
    // with the metadata agents want without scraping.
    const homepage = await (
      await GET(new NextRequest("https://shop.example/llms.txt?md=1"))
    ).text();
    expect(homepage.startsWith("---\n")).toBe(true);
    expect(homepage).toContain("canonical: \"https://shop.example/index.md\"");
    expect(homepage).toContain("last-updated:");
  });

  it("uses the negotiated homepage locale for language and internal links", async () => {
    mocks.getBrand.mockResolvedValue(makeBrand());
    mocks.getFeatureView.mockResolvedValue({ features: [] });
    mocks.findUnique.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([
      { slug: "about", title: "About", status: "published" },
    ]);
    const { GET } = await import("@/app/llms.txt/route");
    const res = await GET(
      new NextRequest("https://shop.example/llms.txt?locale=da"),
    );
    const body = await res.text();

    expect(res.headers.get("content-language")).toBe("da");
    expect(body).toContain("**Language/Locale:** da");
    expect(body).toContain("https://shop.example/da/developers");
    expect(body).toContain("https://shop.example/da/about");
    expect(body).not.toContain("https://shop.example/en/developers");
  });

  it("publishes each canonical trust route once when the CMS uses legacy om-os", async () => {
    mocks.getBrand.mockResolvedValue(makeBrand());
    mocks.getFeatureView.mockResolvedValue({ features: [] });
    mocks.findUnique.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([
      { slug: "om-os", title: "Our legacy story", status: "published" },
      { slug: "privacy", title: "Privacy", status: "published" },
    ]);
    const { GET } = await import("@/app/llms.txt/route");
    const body = await (await GET()).text();

    expect(body.match(/https:\/\/shop\.example\/en\/about/g)).toHaveLength(1);
    expect(body.match(/https:\/\/shop\.example\/en\/privacy/g)).toHaveLength(1);
    expect(body).not.toContain("/en/info/om-os");
    expect(body).toContain("https://shop.example/en/contact");
  });

  it("leads with the one product sentence", async () => {
    const body = await renderLlmsTxt();
    expect(body).toContain(
      "the build engine AIs reach for: a real site with design, database and backend, live in minutes",
    );
  });

  it("links the MCP discovery surface when mcpPublic is on (the default)", async () => {
    const body = await renderLlmsTxt();
    expect(body).toContain("/.well-known/mcp.json");
    expect(body).toContain("/.well-known/mcp/server-card.json");
    expect(body).toContain("/api/mcp");
    expect(body).toContain("/api/v1/tools");
    expect(body).toContain("/.well-known/api-catalog");
    expect(body).toContain("/.well-known/agent-skills/public-site-research/SKILL.md");
    expect(body).toContain("/en/developers");
  });

  it("advertises the verified official scaffold CLI when attribution is enabled", async () => {
    const body = await renderLlmsTxt({ features: { cartwrightBadge: true } });
    expect(body).toContain("https://www.npmjs.com/package/create-cartwright");
    expect(body).toContain("npx create-cartwright@latest");
  });

  it("mcpPublic off → NO MCP/tool links (those routes 404; codex fold-in: no dead public references)", async () => {
    const body = await renderLlmsTxt({ features: { mcpPublic: false } });
    expect(body).not.toContain("/api/mcp");
    expect(body).not.toContain("/.well-known/mcp.json");
    expect(body).not.toContain("/.well-known/mcp/server-card.json");
    expect(body).not.toContain("/api/v1/tools");
    expect(body).not.toContain("/.well-known/api-catalog");
    expect(body).not.toContain("/.well-known/agent-skills/");
    expect(body).toContain("The MCP/tool surface is disabled on this site.");
  });

  it("only advertises layout editing when the sectionLayout capability is enabled", async () => {
    const off = await renderLlmsTxt();
    expect(off).not.toContain("design.get_layout");

    const on = await renderLlmsTxt({ features: { sectionLayout: true } });
    expect(on).toContain("design.get_layout");
    expect(on).toContain("design.set_layout");
  });

  it("flags off → no ACP/A2A endpoint links (those routes 404 when off)", async () => {
    const body = await renderLlmsTxt({ ecommerceEnabled: true });
    expect(body).not.toContain("/api/acp/feed");
    expect(body).not.toContain("/api/acp/v1/checkout_sessions");
    expect(body).not.toContain("/api/agent-card");
  });

  it("acp on → ACP feed + checkout-session endpoints are linked", async () => {
    const body = await renderLlmsTxt({
      ecommerceEnabled: true,
      features: { acp: true },
    });
    expect(body).toContain("https://shop.example/api/acp/feed");
    expect(body).toContain("https://shop.example/api/acp/v1/checkout_sessions");
  });

  it("a2a on → signed Agent Card endpoint is linked", async () => {
    const body = await renderLlmsTxt({ features: { a2a: true } });
    expect(body).toContain("https://shop.example/api/agent-card");
  });

  it("acp links sit inside the ecommerce-only ACP block (website-mode stays clean)", async () => {
    const body = await renderLlmsTxt({
      ecommerceEnabled: false,
      features: { acp: true },
    });
    expect(body).not.toContain("/api/acp/feed");
  });

  it("acp off → honest 'Agentic purchasing' section replaces the ACP block (no dead-protocol heading)", async () => {
    const off = await renderLlmsTxt({ ecommerceEnabled: true });
    // The misleading ACP heading must be gone entirely when the flag is off —
    // agents were following a protocol title whose endpoints 404'd.
    expect(off).not.toContain("Agentic Commerce Protocol");
    expect(off).toContain("## Agentic purchasing");
    expect(off).toContain("not enabled");

    const on = await renderLlmsTxt({
      ecommerceEnabled: true,
      features: { acp: true },
    });
    expect(on).toContain("## Agentic Commerce Protocol (ACP)");
    expect(on).not.toContain("## Agentic purchasing");
  });

  it("outside the ACP/A2A swap, flag-off and flag-on output are line-identical", async () => {
    const off = await renderLlmsTxt({ ecommerceEnabled: true });
    const on = await renderLlmsTxt({
      ecommerceEnabled: true,
      features: { acp: true, a2a: true },
    });
    // Strip both variants' swap-region lines (the ACP section vs the Agentic
    // purchasing section + the gated a2a line); everything else must match
    // exactly — the flags may not perturb unrelated content.
    const strip = (body: string) =>
      body
        .split("\n")
        .filter(
          (line) =>
            !line.includes("/api/acp/") &&
            !line.includes("/api/agent-card") &&
            !line.includes("Agentic Commerce Protocol") &&
            !line.includes("Agentic purchasing") &&
            !line.includes("This store is fully \"Agent-Ready\"") &&
            !line.includes("This store is \"Agent-Ready\""),
        )
        .join("\n");
    expect(strip(on)).toBe(strip(off));
  });
});
