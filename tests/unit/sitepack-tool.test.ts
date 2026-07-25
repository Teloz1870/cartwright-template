import { describe, expect, it, vi } from "vitest";

// The tool module pulls server-only deps (prisma, exportComposition, plugins) via
// its imports; mock the DB so importing the PURE helpers is inert.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/compositions/export", () => ({ exportComposition: vi.fn() }));
vi.mock("@/lib/plugins/install", () => ({ getPluginStates: vi.fn() }));
vi.mock("@/lib/brand", () => ({ resolveStoreIdentity: () => ({ designSlug: "x" }) }));
// withAudit passthrough so we can exercise the handler's flag gate.
vi.mock("@/lib/audit", () => ({ withAudit: async (_m: unknown, fn: () => Promise<unknown>) => fn() }));

import { collectReferencedAssetIds, stableSitePackId, exportSite } from "@/lib/tools/sitepack";

describe("sitepack.export tool wiring", () => {
  it("is read-only (settings:read), confirm-gated, correctly named", () => {
    expect(exportSite.name).toBe("sitepack.export");
    expect(exportSite.scope).toBe("settings:read");
    // confirm:true is required by the input schema.
    expect(exportSite.input.safeParse({}).success).toBe(false);
    expect(exportSite.input.safeParse({ confirm: true }).success).toBe(true);
  });

  it("hard-fails when the sitePack flag is off (default) — never runs an export", async () => {
    const ctx = { actor: "admin", ip: null, userAgent: null } as never;
    await expect(exportSite.handler({ confirm: true }, ctx)).rejects.toThrow(/disabled|sitePack/i);
  });
});

describe("collectReferencedAssetIds", () => {
  it("collects + dedups hero/video/gallery FK ids; ignores null/empty", () => {
    const ids = collectReferencedAssetIds({
      pages: [{ heroImageAssetId: "a" }, { heroImageAssetId: null }, { heroImageAssetId: "" }],
      categories: [{ heroImageAssetId: "a", heroVideoAssetId: "b" }], // 'a' dups the page hero
      services: [{ heroImageAssetId: "c" }],
      productMedia: [{ assetId: "b" }, { assetId: "d" }], // 'b' dups the category video
    });
    expect(ids.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("returns [] when nothing references an asset", () => {
    expect(collectReferencedAssetIds({ pages: [{ slug: "x" }], categories: [], services: [], productMedia: [] })).toEqual([]);
  });
});

describe("stableSitePackId", () => {
  it("is stable for the same store identity + differs across sites", () => {
    const a = stableSitePackId("Aluzaun", "aluzaun.dk");
    expect(a).toBe(stableSitePackId("Aluzaun", "aluzaun.dk")); // re-export → same id (registry dedup)
    expect(a).not.toBe(stableSitePackId("Aluzaun", "other.dk"));
    expect(a).toMatch(/^sp-[0-9a-f]{20}$/);
  });
});
