import { describe, expect, it } from "vitest";

import { buildImportPlan, resolveCollision, type ExistingState } from "@/lib/sitepack/import-plan";
import type { SitePackContent } from "@/lib/sitepack/import-parse";
import type { SitePackManifest } from "@/lib/sitepack/spec";

/**
 * SitePack import — the DRY-RUN PLAN. Proves the confirm-surface the wizard shows
 * is TRUTHFUL: non-destructive suffix-on-collision (the predicted key must equal
 * what apply will write), Product's dual slug+sku uniqueness, media reuse-vs-fetch,
 * count reconciliation, and degrade warnings.
 */

// Only the fields buildImportPlan reads — cast past the full manifest shape.
const manifest = (over: Partial<SitePackManifest> = {}): SitePackManifest =>
  ({
    name: "Aluzaun",
    mode: "webshop",
    designRef: { slug: "aurora-shop", kind: "data", version: "0.0.0" },
    pluginsRequired: [],
    featuresRequired: [],
    counts: {},
    ...over,
  }) as unknown as SitePackManifest;

const content = (over: Partial<SitePackContent> = {}): SitePackContent => ({
  pages: [],
  categories: [],
  services: [],
  posts: [],
  products: [],
  variants: [],
  productMedia: [],
  media: [],
  branding: null,
  integration: null,
  ...over,
});

const existing = (over: Partial<ExistingState> = {}): ExistingState => ({
  pageSlugs: new Set(),
  categorySlugs: new Set(),
  serviceSlugs: new Set(),
  postSlugs: new Set(),
  productSlugs: new Set(),
  productSkus: new Set(),
  mediaSha256: new Set(),
  ...over,
});

const pages = (plan: ReturnType<typeof buildImportPlan>) => plan.collections.find((c) => c.collection === "pages")!;
const products = (plan: ReturnType<typeof buildImportPlan>) => plan.collections.find((c) => c.collection === "products")!;

describe("resolveCollision — deterministic suffix rule", () => {
  it("returns the value untouched when free", () => {
    expect(resolveCollision("about", new Set())).toBe("about");
  });
  it("suffixes -2 on first collision", () => {
    expect(resolveCollision("about", new Set(["about"]))).toBe("about-2");
  });
  it("skips already-taken suffixes", () => {
    expect(resolveCollision("about", new Set(["about", "about-2", "about-3"]))).toBe("about-4");
  });
});

describe("buildImportPlan — slug collections (non-destructive)", () => {
  it("classifies all-new rows as create", () => {
    const plan = buildImportPlan(manifest(), content({ pages: [{ slug: "home" }, { slug: "about" }] }), existing());
    expect(pages(plan)).toMatchObject({ total: 2, create: 2, suffixed: 0, skip: 0 });
  });

  it("suffixes a row colliding with an EXISTING slug", () => {
    const plan = buildImportPlan(manifest(), content({ pages: [{ slug: "about" }] }), existing({ pageSlugs: new Set(["about"]) }));
    const p = pages(plan);
    expect(p).toMatchObject({ create: 0, suffixed: 1 });
    expect(p.items[0]).toMatchObject({ key: "about", action: "create-suffixed", resolvedSlug: "about-2" });
  });

  it("suffixes a row colliding with an EARLIER incoming row (within-import)", () => {
    const plan = buildImportPlan(manifest(), content({ pages: [{ slug: "about" }, { slug: "about" }] }), existing());
    const p = pages(plan);
    expect(p).toMatchObject({ create: 1, suffixed: 1 });
    expect(p.items[1]).toMatchObject({ action: "create-suffixed", resolvedSlug: "about-2" });
  });

  it("skips a row with no slug", () => {
    const plan = buildImportPlan(manifest(), content({ pages: [{ title: "no slug" }] }), existing());
    expect(pages(plan).items[0]).toMatchObject({ key: null, action: "skip", reason: "missing slug" });
  });
});

describe("buildImportPlan — products (dual slug + sku uniqueness)", () => {
  it("suffixes the SLUG when only the slug collides", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ products: [{ slug: "gate", sku: "GATE-1" }] }),
      existing({ productSlugs: new Set(["gate"]) }),
    );
    expect(products(plan).items[0]).toMatchObject({ action: "create-suffixed", resolvedSlug: "gate-2" });
    expect(products(plan).items[0].resolvedSku).toBeUndefined(); // sku was free
  });

  it("suffixes the SKU when only the sku collides (slug stays unchanged)", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ products: [{ slug: "gate", sku: "GATE-1" }] }),
      existing({ productSkus: new Set(["GATE-1"]) }),
    );
    const item = products(plan).items[0];
    expect(item).toMatchObject({ action: "create-suffixed", resolvedSku: "GATE-1-2" });
    expect(item.resolvedSlug).toBeUndefined(); // slug was free → not suffixed
  });

  it("resolves BOTH when slug and sku collide", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ products: [{ slug: "gate", sku: "GATE-1" }] }),
      existing({ productSlugs: new Set(["gate"]), productSkus: new Set(["GATE-1"]) }),
    );
    expect(products(plan).items[0]).toMatchObject({ action: "create-suffixed", resolvedSlug: "gate-2", resolvedSku: "GATE-1-2" });
  });

  it("treats a null sku as collision-free", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ products: [{ slug: "gate" }] }), // no sku
      existing({ productSkus: new Set(["GATE-1"]) }),
    );
    expect(products(plan).items[0]).toMatchObject({ action: "create" });
  });

  it("resolves a second product's slug against the FIRST row's resolved slug (no apply-time crash)", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ products: [{ slug: "gate" }, { slug: "gate" }] }),
      existing({ productSlugs: new Set(["gate"]) }),
    );
    const items = products(plan).items;
    expect(items[0]).toMatchObject({ resolvedSlug: "gate-2" });
    expect(items[1]).toMatchObject({ resolvedSlug: "gate-3" }); // not gate-2 again
  });

  it("resolves a second product's sku against the FIRST row's resolved sku", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ products: [{ slug: "a", sku: "X" }, { slug: "b", sku: "X" }] }),
      existing({ productSkus: new Set(["X"]) }),
    );
    const items = products(plan).items;
    expect(items[0].resolvedSku).toBe("X-2");
    expect(items[1].resolvedSku).toBe("X-3");
  });

  it("keeps slug namespaces separate — an existing PAGE slug does not suffix a product", () => {
    const plan = buildImportPlan(manifest(), content({ products: [{ slug: "gate" }] }), existing({ pageSlugs: new Set(["gate"]) }));
    expect(products(plan).items[0]).toMatchObject({ action: "create" });
  });
});

describe("buildImportPlan — media (reuse vs fetch)", () => {
  it("reuses present sha256, fetches new ones and sums bytes", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ media: [{ sha256: "aaa", sizeBytes: 100 }, { sha256: "bbb", sizeBytes: 250 }] }),
      existing({ mediaSha256: new Set(["aaa"]) }),
    );
    expect(plan.media).toMatchObject({ total: 2, reuse: 1, fetch: 1, fetchBytes: 250, skip: 0 });
  });

  it("fetches a duplicated-in-pack sha only once", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ media: [{ sha256: "aaa", sizeBytes: 100 }, { sha256: "aaa", sizeBytes: 100 }] }),
      existing(),
    );
    expect(plan.media).toMatchObject({ fetch: 1, fetchBytes: 100 });
  });

  it("skips a media row with no content hash and warns", () => {
    const plan = buildImportPlan(manifest(), content({ media: [{ mime: "image/webp" }] }), existing());
    expect(plan.media.skip).toBe(1);
    expect(plan.warnings.some((w) => /no content hash/.test(w))).toBe(true);
  });

  it("counts a duplicated EXISTING sha as a single reuse (not per-row)", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ media: [{ sha256: "aaa" }, { sha256: "aaa" }] }),
      existing({ mediaSha256: new Set(["aaa"]) }),
    );
    expect(plan.media).toMatchObject({ reuse: 1, fetch: 0 });
  });
});

describe("buildImportPlan — counts reconciliation", () => {
  it("flags a declared-vs-parsed mismatch (rows dropped as malformed)", () => {
    const plan = buildImportPlan(manifest({ counts: { pages: 3 } }), content({ pages: [{ slug: "a" }] }), existing());
    const check = plan.countChecks.find((c) => c.collection === "pages")!;
    expect(check).toMatchObject({ declared: 3, actual: 1, ok: false });
    expect(plan.warnings.some((w) => /Count mismatch for pages.*2 dropped/.test(w))).toBe(true);
  });

  it("no warning when declared equals parsed", () => {
    const plan = buildImportPlan(manifest({ counts: { pages: 1 } }), content({ pages: [{ slug: "a" }] }), existing());
    expect(plan.countChecks.find((c) => c.collection === "pages")!.ok).toBe(true);
    expect(plan.warnings.some((w) => /Count mismatch/.test(w))).toBe(false);
  });

  it("flags parsed-exceeds-declared without negative 'dropped' wording", () => {
    const plan = buildImportPlan(manifest({ counts: { pages: 1 } }), content({ pages: [{ slug: "a" }, { slug: "b" }] }), existing());
    expect(plan.countChecks.find((c) => c.collection === "pages")!).toMatchObject({ declared: 1, actual: 2, ok: false });
    expect(plan.warnings.some((w) => /Count mismatch for pages/.test(w))).toBe(true);
    expect(plan.warnings.some((w) => /dropped/.test(w))).toBe(false);
  });

  it("reconciles mediaAssets and rider (variants/productMedia) counts too", () => {
    const plan = buildImportPlan(
      manifest({ counts: { mediaAssets: 2, variants: 3, productMedia: 5 } }),
      content({ media: [{ sha256: "a" }], variants: [{ productSlug: "p", sku: "v" }], productMedia: [{ productSlug: "p", assetSha256: "a" }] }),
      existing(),
    );
    expect(plan.countChecks.find((c) => c.collection === "mediaAssets")!).toMatchObject({ declared: 2, actual: 1, ok: false });
    expect(plan.countChecks.find((c) => c.collection === "variants")!).toMatchObject({ declared: 3, actual: 1, ok: false });
    expect(plan.countChecks.find((c) => c.collection === "productMedia")!).toMatchObject({ declared: 5, actual: 1, ok: false });
  });
});

describe("buildImportPlan — degrade warnings", () => {
  it("warns when a CODE design is not installed (installed:false)", () => {
    const plan = buildImportPlan(
      manifest({ designRef: { slug: "apex", kind: "code", version: "1.0.0" } }),
      content(),
      existing({ installedDesigns: new Set(["aurora-shop"]) }),
    );
    expect(plan.designRef).toMatchObject({ slug: "apex", kind: "code", installed: false });
    expect(plan.warnings.some((w) => /code design.*isn't installed/.test(w))).toBe(true);
  });

  it("does not warn for a DATA design, and leaves installed null when not probed", () => {
    const plan = buildImportPlan(manifest({ designRef: { slug: "aurora-shop", kind: "data", version: "0.0.0" } }), content(), existing());
    expect(plan.designRef.installed).toBeNull();
    expect(plan.warnings.some((w) => /design/.test(w))).toBe(false);
  });

  it("warns for required plugins/features that are missing (only when probed)", () => {
    const m = manifest({ pluginsRequired: ["phone-widget"], featuresRequired: ["reviews"] });
    const probed = buildImportPlan(m, content(), existing({ installedPlugins: new Set(), enabledFeatures: new Set() }));
    expect(probed.warnings.some((w) => /plugin "phone-widget"/.test(w))).toBe(true);
    expect(probed.warnings.some((w) => /feature "reviews"/.test(w))).toBe(true);
    // Not probed → no plugin/feature warnings.
    const unprobed = buildImportPlan(m, content(), existing());
    expect(unprobed.warnings.some((w) => /plugin|feature/.test(w))).toBe(false);
  });
});

describe("buildImportPlan — riders + totals", () => {
  it("counts variants/productMedia as riders and aggregates totals", () => {
    const plan = buildImportPlan(
      manifest(),
      content({
        pages: [{ slug: "home" }, { slug: "home" }], // 1 create + 1 suffixed
        products: [{ slug: "gate", sku: "X" }],
        variants: [{ productSlug: "gate", sku: "v1" }, { productSlug: "gate", sku: "v2" }],
        productMedia: [{ productSlug: "gate", assetSha256: "aaa" }],
      }),
      existing(),
    );
    expect(plan.riders).toEqual({ variants: 2, productMedia: 1 });
    expect(plan.totals).toMatchObject({ create: 2, suffixed: 1, skip: 0 }); // home + gate create, home-2 suffixed
  });
});

describe("buildImportPlan — the stored-slug rule (SITEPACK-SLUG-VALIDATE)", () => {
  const categories = (plan: ReturnType<typeof buildImportPlan>) => plan.collections.find((c) => c.collection === "categories")!;
  const slugWarnings = (plan: ReturnType<typeof buildImportPlan>) => plan.warnings.filter((w) => /URL-safe/.test(w));

  it('trims "cup " so it collides with the existing "cup" instead of sitting beside it', () => {
    const plan = buildImportPlan(manifest(), content({ products: [{ slug: "cup " }] }), existing({ productSlugs: new Set(["cup"]) }));
    // key stays the pack's own slug (children relink by it); the row is created under cup-2.
    expect(products(plan).items[0]).toEqual({ key: "cup ", action: "create-suffixed", resolvedSlug: "cup-2" });
  });

  it("lowercases + trims a slug that needs nothing else, as a plain create", () => {
    const plan = buildImportPlan(manifest(), content({ products: [{ slug: " Cup" }] }), existing());
    expect(products(plan).items[0]).toEqual({ key: " Cup", action: "create", resolvedSlug: "cup" });
    expect(slugWarnings(plan)).toEqual(['products: 1 slug is not URL-safe (a-z, 0-9, hyphens) and will be stored normalised — " Cup" → "cup".']);
  });

  it("renames a slug with characters outside a-z0-9- through the shared slugify", () => {
    const plan = buildImportPlan(manifest(), content({ products: [{ slug: "Kaffe & Bønner" }] }), existing());
    expect(products(plan).items[0]).toMatchObject({ action: "create", resolvedSlug: "kaffe-boenner" });
  });

  it("keeps a valid slug when a malformed twin comes first in the pack (the twin takes the suffix)", () => {
    const plan = buildImportPlan(manifest(), content({ products: [{ slug: "cup " }, { slug: "cup" }] }), existing());
    const items = products(plan).items;
    expect(items[0]).toEqual({ key: "cup ", action: "create-suffixed", resolvedSlug: "cup-2" });
    expect(items[1]).toEqual({ key: "cup", action: "create" });
  });

  it("applies the valid-slug-first rule to every slug collection", () => {
    const twins = [{ slug: "About " }, { slug: "about" }];
    const plan = buildImportPlan(manifest(), content({ pages: twins, categories: twins, services: twins, posts: twins }), existing());
    for (const name of ["pages", "categories", "services", "posts"]) {
      const items = plan.collections.find((c) => c.collection === name)!.items;
      expect(items[0]).toEqual({ key: "About ", action: "create-suffixed", resolvedSlug: "about-2" });
      expect(items[1]).toEqual({ key: "about", action: "create" });
    }
  });

  it("a valid slug that claimed itself keeps it when only its SKU collides", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ products: [{ slug: "cup ", sku: "A" }, { slug: "cup", sku: "X" }] }),
      existing({ productSkus: new Set(["X"]) }),
    );
    const items = products(plan).items;
    expect(items[0]).toEqual({ key: "cup ", action: "create-suffixed", resolvedSlug: "cup-2" });
    expect(items[1]).toEqual({ key: "cup", action: "create-suffixed", resolvedSku: "X-2" });
  });

  it("a normalised slug skips past both existing slugs and valid pack slugs", () => {
    const plan = buildImportPlan(manifest(), content({ products: [{ slug: "Cup" }, { slug: "cup-2" }] }), existing({ productSlugs: new Set(["cup"]) }));
    const items = products(plan).items;
    expect(items[0]).toEqual({ key: "Cup", action: "create-suffixed", resolvedSlug: "cup-3" });
    expect(items[1]).toEqual({ key: "cup-2", action: "create" });
  });

  it("stores a category with no usable slug under its name, so its products still restore", () => {
    const plan = buildImportPlan(
      manifest(),
      content({ categories: [{ slug: "   ", name: "Fences" }], products: [{ slug: "panel", categorySlug: "   " }] }),
      existing(),
    );
    expect(categories(plan).items[0]).toEqual({ key: "   ", action: "create", resolvedSlug: "fences" });
    expect(products(plan).items[0]).toEqual({ key: "panel", action: "create" });
    expect(slugWarnings(plan)).toEqual(['categories: 1 slug is not URL-safe (a-z, 0-9, hyphens) and will be stored normalised — "   " → "fences" (from its name).']);
  });

  it("skips the products (and their riders) of a category that is skipped, and says so", () => {
    const plan = buildImportPlan(
      manifest(),
      content({
        categories: [{ slug: "日本", name: "日本" }, { slug: "fences", name: "Fences" }],
        products: [
          { slug: "a", categorySlug: "日本" },
          { slug: "b", categorySlug: "日本" },
          { slug: "a", categorySlug: "fences" }, // the skipped "a" does not hold the slug
        ],
        variants: [{ productSlug: "b", sku: "v1" }],
        productMedia: [{ productSlug: "b", assetSha256: "aaa" }],
      }),
      existing(),
    );
    const p = products(plan);
    expect(p).toMatchObject({ create: 1, suffixed: 0, skip: 2 });
    expect(p.items[0]).toEqual({ key: "a", action: "skip", reason: "its category is skipped" });
    expect(p.items[2]).toEqual({ key: "a", action: "create" });
    expect(plan.riders).toEqual({ variants: 0, productMedia: 0 });
    expect(plan.totals).toEqual({ create: 2, suffixed: 0, skip: 3 });
    expect(plan.warnings).toContain(
      'products: 2 rows are in a skipped category and will be skipped too, with 1 variant and 1 gallery link — "a", "b".',
    );
  });

  it("skips a row with nothing slug-safe left, with a reason and a warning", () => {
    const plan = buildImportPlan(manifest(), content({ products: [{ slug: "   " }, { slug: "日本" }] }), existing());
    const p = products(plan);
    expect(p).toMatchObject({ create: 0, skip: 2 });
    expect(p.items[0]).toEqual({ key: "   ", action: "skip", reason: "no URL-safe slug" });
    expect(slugWarnings(plan)).toEqual(['products: 2 rows have no URL-safe slug and will be skipped — "   ", "日本".']);
  });

  it("applies the same rule to categories and pages", () => {
    const plan = buildImportPlan(manifest(), content({ categories: [{ slug: " Fences " }], pages: [{ slug: "About Us" }] }), existing());
    expect(categories(plan).items[0]).toEqual({ key: " Fences ", action: "create", resolvedSlug: "fences" });
    expect(pages(plan).items[0]).toMatchObject({ resolvedSlug: "about-us" });
    expect(slugWarnings(plan)).toHaveLength(2);
  });

  it("leaves a slug that already meets the rule byte-identical — even one slugify would collapse", () => {
    const plan = buildImportPlan(manifest(), content({ products: [{ slug: "a--b" }, { slug: "-edge-" }] }), existing());
    for (const item of products(plan).items) expect(item.resolvedSlug).toBeUndefined();
    expect(slugWarnings(plan)).toEqual([]);
  });

  it("caps the warning's examples so a large malformed pack stays readable", () => {
    const plan = buildImportPlan(manifest(), content({ pages: ["A", "B", "C", "D", "E"].map((slug) => ({ slug })) }), existing());
    expect(slugWarnings(plan)[0]).toMatch(/5 slugs are not URL-safe .* \+2 more\.$/);
  });
});
