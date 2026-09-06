import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * SEO-indeksering (E) — robots.txt-output for hver kombination. Mocket getBrand +
 * getSeoSettings.
 */

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  getSeoSettings: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/seo-settings", () => ({ getSeoSettings: mocks.getSeoSettings }));

beforeEach(() => {
  vi.resetModules();
  mocks.getBrand.mockReset().mockResolvedValue({ url: "https://shop.dk" });
  mocks.getSeoSettings.mockReset();
});

describe("robots.txt", () => {
  it("public + allow → AI-crawlere bydes velkommen (2 regler)", async () => {
    mocks.getSeoSettings.mockResolvedValue({ indexing: "public", aiCrawlers: "allow" });
    const robots = (await import("@/app/robots")).default;
    const out = await robots();
    expect(Array.isArray(out.rules)).toBe(true);
    const rules = out.rules as { userAgent: unknown; allow?: unknown; disallow?: unknown }[];
    expect(rules).toHaveLength(2);
    expect(rules[1].allow).toBe("/");
    expect(JSON.stringify(rules[1].userAgent)).toContain("GPTBot");
  });

  it("noindex → ALLE crawlere afvises på hele sitet", async () => {
    mocks.getSeoSettings.mockResolvedValue({ indexing: "noindex", aiCrawlers: "allow" });
    const robots = (await import("@/app/robots")).default;
    const out = await robots();
    const rules = out.rules as { userAgent: unknown; disallow?: unknown }[];
    expect(rules).toHaveLength(1);
    expect(rules[0].userAgent).toBe("*");
    expect(rules[0].disallow).toBe("/");
  });

  it("aiCrawlers=block-training → kun trænings-bots afvises; AI-søgning + agenter velkomne", async () => {
    mocks.getSeoSettings.mockResolvedValue({ indexing: "public", aiCrawlers: "block-training" });
    const robots = (await import("@/app/robots")).default;
    const out = await robots();
    const rules = out.rules as { userAgent: unknown; allow?: unknown; disallow?: unknown }[];
    expect(rules).toHaveLength(3);
    expect(rules[0].allow).toBe("/"); // * må stadig
    // Search- + agent-bots bydes eksplicit velkommen …
    expect(rules[1].allow).toBe("/");
    const welcomed = JSON.stringify(rules[1].userAgent);
    expect(welcomed).toContain("OAI-SearchBot");
    expect(welcomed).toContain("ChatGPT-User");
    expect(welcomed).toContain("Claude-User");
    // … trænings-bots afvises.
    expect(rules[2].disallow).toBe("/");
    const blocked = JSON.stringify(rules[2].userAgent);
    expect(blocked).toContain("GPTBot");
    expect(blocked).toContain("ClaudeBot");
    expect(blocked).toContain("Google-Extended");
    expect(blocked).not.toContain("Perplexity");
  });

  it("aiCrawlers=block → AI afvises, søgemaskiner må stadig", async () => {
    mocks.getSeoSettings.mockResolvedValue({ indexing: "public", aiCrawlers: "block" });
    const robots = (await import("@/app/robots")).default;
    const out = await robots();
    const rules = out.rules as { userAgent: unknown; allow?: unknown; disallow?: unknown }[];
    expect(rules[0].allow).toBe("/"); // * må stadig
    expect(rules[1].disallow).toBe("/"); // AI afvist
    expect(JSON.stringify(rules[1].userAgent)).toContain("ClaudeBot");
  });
});
