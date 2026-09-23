import { describe, expect, it, vi } from "vitest";

// The tool module pulls server-only deps (prisma, Blob, composition, media) via
// its imports; mock them so importing the PURE helpers + the wiring is inert.
// The prisma delegates are spies so we can prove createRow's model→delegate map.
vi.mock("@/lib/db", () => ({
  prisma: {
    category: { create: vi.fn(async () => ({ id: "cat_1" })) },
    product: { create: vi.fn(async () => ({ id: "prod_1" })) },
    productVariant: { create: vi.fn(async () => ({ id: "var_1" })) },
    productMedia: { create: vi.fn(async () => ({})) },
    page: { create: vi.fn(async () => ({ id: "page_1" })) },
    service: { create: vi.fn(async () => ({ id: "svc_1" })) },
    post: { create: vi.fn(async () => ({ id: "post_1" })) },
    mediaAsset: { findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("@/lib/compositions/apply", () => ({ applyComposition: vi.fn() }));
vi.mock("@/lib/compositions/export", () => ({ exportComposition: vi.fn() }));
vi.mock("@/lib/media/asset", () => ({ findOrCreateBySha256: vi.fn(), computeSha256: vi.fn() }));
vi.mock("@/lib/plugins/install", () => ({ getPluginStates: vi.fn() }));
vi.mock("@/lib/brand", () => ({ resolveStoreIdentity: () => ({ designSlug: "x" }) }));
vi.mock("@/designs/options", () => ({ DESIGN_OPTIONS: [{ slug: "aurora-shop" }, { slug: "apex" }] }));
// withAudit passthrough so we can exercise the handler's flag gate.
vi.mock("@/lib/audit", () => ({ withAudit: async (_m: unknown, fn: () => Promise<unknown>) => fn() }));

import { importSite, sitepackTools, extFor, assembleExistingState, createRow } from "@/lib/tools/sitepack";
import { prisma } from "@/lib/db";

describe("sitepack.import tool wiring", () => {
  it("is a WRITE tool, correctly named, preview-or-confirm gated", () => {
    expect(importSite.name).toBe("sitepack.import");
    expect(importSite.scope).toBe("settings:write");
    // neither dryRun nor confirm → invalid (can't apply without confirm)
    expect(importSite.input.safeParse({ cartpackBase64: "AA==" }).success).toBe(false);
    // dryRun preview → valid WITHOUT confirm
    expect(importSite.input.safeParse({ cartpackBase64: "AA==", dryRun: true }).success).toBe(true);
    // confirm apply → valid
    expect(importSite.input.safeParse({ cartpackBase64: "AA==", confirm: true }).success).toBe(true);
    // missing the pack → invalid
    expect(importSite.input.safeParse({ confirm: true }).success).toBe(false);
  });

  it("hard-fails when the sitePack flag is off (default) — never opens the pack", async () => {
    const ctx = { actor: "user:admin", ip: null, userAgent: null } as never;
    await expect(importSite.handler({ cartpackBase64: "AA==", confirm: true }, ctx)).rejects.toThrow(/disabled|sitePack/i);
  });

  it("is registered in sitepackTools next to export", () => {
    expect(sitepackTools.map((t) => t.name).sort()).toEqual(["sitepack.export", "sitepack.import"]);
  });
});

describe("createRow — model → prisma delegate mapping (tsc can't catch a wrong delegate)", () => {
  it("routes each ImportModel to the RIGHT delegate (variant → productVariant, not variant)", async () => {
    expect(await createRow("category", {})).toBe("cat_1");
    expect(vi.mocked(prisma.category.create)).toHaveBeenCalledOnce();

    expect(await createRow("variant", {})).toBe("var_1");
    expect(vi.mocked(prisma.productVariant.create)).toHaveBeenCalledOnce(); // NOT prisma.variant

    expect(await createRow("productMedia", {})).toBe(""); // composite key → no id
    expect(vi.mocked(prisma.productMedia.create)).toHaveBeenCalledOnce();

    expect(await createRow("product", {})).toBe("prod_1");
    expect(await createRow("page", {})).toBe("page_1");
    expect(await createRow("service", {})).toBe("svc_1");
    expect(await createRow("post", {})).toBe("post_1");
    expect(vi.mocked(prisma.product.create)).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.page.create)).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.service.create)).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.post.create)).toHaveBeenCalledOnce();
  });
});

describe("extFor", () => {
  it("maps known mimes and falls back to bin", () => {
    expect(extFor("image/webp")).toBe("webp");
    expect(extFor("video/mp4")).toBe("mp4");
    expect(extFor("image/svg+xml")).toBe("svg");
    expect(extFor("application/x-unknown")).toBe("bin");
  });
});

describe("assembleExistingState", () => {
  it("builds slug/sku/sha sets (filtering nulls) and passes capability lists through", () => {
    const st = assembleExistingState({
      pages: [{ slug: "home" }, { slug: null }],
      categories: [{ slug: "fences" }],
      services: [],
      posts: [],
      products: [{ slug: "panel", sku: "P-1" }, { slug: "gate", sku: null }],
      media: [{ sha256: "aaa" }, { sha256: null }],
      installedDesigns: ["aurora-shop"],
      installedPlugins: ["phone-widget"],
      enabledFeatures: ["reviews"],
    });
    expect([...st.pageSlugs]).toEqual(["home"]); // null slug filtered
    expect([...st.categorySlugs]).toEqual(["fences"]);
    expect([...st.productSlugs].sort()).toEqual(["gate", "panel"]);
    expect([...st.productSkus]).toEqual(["P-1"]); // null sku filtered
    expect([...st.mediaSha256]).toEqual(["aaa"]);
    expect([...(st.installedDesigns ?? [])]).toEqual(["aurora-shop"]);
    expect([...(st.installedPlugins ?? [])]).toEqual(["phone-widget"]);
    expect([...(st.enabledFeatures ?? [])]).toEqual(["reviews"]);
  });

  it("filters empty strings as well as nulls (the !!s contract)", () => {
    const st = assembleExistingState({
      pages: [{ slug: "" }, { slug: "home" }, { slug: null }],
      categories: [],
      services: [],
      posts: [],
      products: [{ slug: "", sku: "" }, { slug: "panel", sku: "P-1" }],
      media: [{ sha256: "" }, { sha256: "aaa" }],
      installedDesigns: [],
      installedPlugins: [],
      enabledFeatures: [],
    });
    expect([...st.pageSlugs]).toEqual(["home"]); // "" dropped
    expect([...st.productSlugs]).toEqual(["panel"]);
    expect([...st.productSkus]).toEqual(["P-1"]); // "" sku dropped
    expect([...st.mediaSha256]).toEqual(["aaa"]);
  });
});
