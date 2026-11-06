import { describe, expect, it, vi } from "vitest";
import { getTool } from "@/lib/tools/registry";
import { zodOutputJsonSchema } from "@/lib/zod-json-schema";

const dbMocks = vi.hoisted(() => ({
  page: { findMany: vi.fn() },
  shippingSettings: { findUnique: vi.fn() },
  brandingSettings: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: dbMocks }));

const ISO = "2026-08-23T12:34:56.000Z";

const branding = {
  id: 1,
  storeName: "Cartwright",
  heroImage: "https://example.com/hero.jpg",
  heroImageAssetId: null,
  announcement: "Hello",
  agenticPolicyJson: null,
  setupComplete: true,
  tagline: null,
  domain: null,
  emailFrom: null,
  emailFromName: null,
  emailSupport: null,
  emailAdmin: null,
  industryTemplate: null,
  designSlug: null,
  themeJson: null,
  layoutJson: null,
  ecommerceEnabled: true,
  websiteHeadline: null,
  heroCta: null,
  logoImageUrl: null,
  logoMarkPaths: null,
  logoMarkViewBox: null,
  logoMarkStrokeWidth: null,
  logoMarkClass: null,
  logoTransform: null,
  faviconBg: null,
  faviconFg: null,
  defaultLocale: "en",
  featureOverridesJson: null,
  threeDConfigJson: null,
  chromeJson: null,
  genomeJson: null,
  seoIndexing: "public",
  aiCrawlers: "allow",
  updatedAt: ISO,
};

const vertical = {
  ok: true,
  slug: "cafe",
  appliedSkin: "apex",
  skinSkipped: null,
  appliedPalette: true,
  appliedScene: "aurora",
  fields: 3,
  identityKeys: ["tone", "audience"],
};

const sitepackPlan = {
  name: "Example site",
  mode: "website",
  collections: [],
  riders: { variants: 0, productMedia: 0 },
  media: { total: 0, reuse: 0, fetch: 0, fetchBytes: 0, skip: 0 },
  designRef: { slug: "apex", kind: "data", version: "1.0.0", installed: true },
  countChecks: [],
  warnings: [],
  totals: { create: 0, suffixed: 0, skip: 0 },
};

/** Representative values are already in their on-the-wire JSON form: Dates
 * are ISO strings, nullable Prisma columns are explicit, and no undefined
 * object property is relied upon. Multiple entries exercise output unions. */
const representativeOutputs: Record<string, unknown[]> = {
  "services.create": [
    { id: "svc_1", slug: "consulting", status: "published", publicUrl: "/services/consulting" },
  ],
  "services.update": [{ id: "svc_1", slug: "consulting" }],
  "pages.list": [[{ id: "page_1", slug: "about", title: "About", status: "published", updatedAt: ISO }]],
  "pages.upsert": [{ id: "page_1", slug: "about", title: "About", status: "draft" }],
  "pages.delete": [{ ok: true, slug: "about" }],
  "pages.get_layout": [{ layout: null }],
  "pages.set_layout": [{ slug: "home", sections: 2 }],
  "posts.list": [[{ id: "post_1", slug: "news", title: "News", status: "draft", updatedAt: ISO }]],
  "posts.create": [{ id: "post_1", slug: "news", status: "draft", publicUrl: "/blog/news" }],
  "posts.update": [{ id: "post_1", slug: "news", status: "draft" }],
  "posts.publish": [
    { slug: "news", status: "published", publishedAt: ISO },
    { slug: "news", status: "draft", publishedAt: null },
  ],
  "settings.get": [
    { type: "shipping", id: 1, shippingFeeOere: 4_900, freeShippingThresholdOere: 49_900, updatedAt: ISO },
    { type: "branding", ...branding },
  ],
  "settings.update_shipping": [
    { id: 1, shippingFeeOere: 4_900, freeShippingThresholdOere: 49_900, updatedAt: ISO },
  ],
  "settings.update_branding": [branding, { ...branding, ignored: ["storeName"] }],
  "settings.update_copy": [branding],
  "features.get": [
    {
      features: [
        {
          key: "aiStylist",
          label: "AI assistant",
          description: "Assistant surface",
          group: "Storefront UX",
          tier: "runtime",
          runtimeToggleable: true,
          implemented: true,
          enabled: true,
          configDefault: true,
          overridden: false,
          blockedReason: null,
        },
      ],
      identity: [
        { key: "mode", label: "Mode", description: "Site mode", value: "website" },
        { key: "ecommerceEnabled", label: "Commerce", description: "Commerce identity", value: true },
      ],
    },
  ],
  "features.set": [{ ok: true, key: "reviews", enabled: true, reset: false }],
  "three.get": [
    {
      config: { scene: "aurora", intensity: 0.5, paletteSource: "theme" },
      scenes: [{ id: "aurora", label: "Aurora", description: "Palette-driven ribbons" }],
    },
  ],
  "three.configure": [
    { ok: true, config: { scene: "aurora", intensity: 0.5, paletteSource: "theme" } },
  ],
  "genome.get": [
    {
      deps: { tone: "warm", audience: "general", formality: "balanced", vibe: "calm", storeName: "Cartwright" },
      fields: [
        {
          key: "footer.tagline",
          label: "Footer tagline",
          lock: "resolvable",
          dependsOn: ["tone"],
          anchor: "A thoughtful default tagline",
          override: null,
          resolved: null,
          current: "A thoughtful default tagline",
          status: "anchor",
        },
      ],
    },
  ],
  "genome.set": [{ ok: true, key: "footer.tagline", value: null }],
  "genome.resolve": [{ ok: true, value: "A newly resolved tagline", cached: false }],
  "genome.set_identity": [{ ok: true, key: "tone", value: "warm" }],
  "genome.reharmonize": [
    {
      results: [
        { key: "footer.tagline", result: { ok: true, value: "A warm tagline", cached: false } },
        { key: "home.hero.headline", result: { ok: false, error: "Provider unavailable" } },
      ],
    },
  ],
  "genome.describe_business": [
    {
      ok: true,
      identity: { tone: "warm", audience: "consumer", formality: "casual", vibe: "calm" },
      reharmonized: [],
    },
  ],
  "genome.set_entity_copy": [{ key: "product:prod_1:description", set: true }],
  "design.import_from_url": [
    {
      applied: true,
      palette: { accent: "#123456", accentDeep: "#102030", cream: "#fff", sand: "#eee", ink: "#111", muted: "#777" },
    },
  ],
  "design.get_layout": [{ layout: null }],
  "design.set_layout": [{ layout: { sections: [{ key: "hero", enabled: true }] } }],
  "vertical.apply": [vertical],
  "design.set_slug": [{ designSlug: null }],
  "magic.compose_look": [
    { appliedVertical: "cafe", appliedDesign: null, voiceDetail: vertical, previewUrl: "/en/mixer-preview?design=apex&vertical=cafe" },
  ],
  "chrome.set": [
    { headerKey: "minimal-header", footerKey: null, previewUrl: "/en/mixer-preview?design=apex" },
  ],
  "composition.apply": [
    {
      ok: true,
      name: "Apex look",
      appliedSkin: "apex",
      appliedPalette: false,
      appliedChrome: { headerKey: "minimal-header" },
      appliedScene: null,
      fields: 0,
      identityKeys: [],
      appliedHomepage: null,
      skipped: [],
      previewUrl: "/en/mixer-preview?design=apex",
    },
  ],
  "composition.export": [
    { schema: "cartwright-composition-v1", name: "Apex look", skin: "apex" },
  ],
  "mockup.set": [
    { published: true, slug: "home", htmlLength: 42, note: "The homepage now renders this mockup." },
  ],
  "mockup.clear": [
    { cleared: false, note: "No homepage mockup was set." },
    { cleared: true, slug: "home", note: "The homepage renders the active design again." },
  ],
  "content.import_site": [
    {
      site: "https://example.com",
      outcomes: [
        {
          url: "https://example.com/about",
          kind: "page",
          action: "page",
          ok: true,
          slug: "about",
          status: "draft",
          imageImported: false,
          adminUrl: "/admin/sider",
          publicUrl: "/info/about",
        },
      ],
      summary: { created: 1, skipped: 0, failed: 0, imagesImported: 0 },
      notice: "Review and rephrase drafts before publishing.",
    },
  ],
  "sitepack.export": [
    {
      name: "Example site",
      filename: "apex.cartpack",
      sizeBytes: 1_024,
      counts: { pages: 1, categories: 0, products: 0, services: 0, posts: 0, mediaAssets: 0 },
      skippedProductMedia: 0,
      mediaFetchFailed: 0,
      cartpackBase64: "Y2FydHBhY2s=",
    },
  ],
  "sitepack.import": [
    { dryRun: true, name: "Example site", mode: "website", plan: sitepackPlan },
    {
      ok: true,
      name: "Example site",
      created: { pages: 1 },
      skipped: {},
      mediaStored: 0,
      mediaFailed: 0,
      appliedComposition: true,
      snapshotId: "pre-import-sp_1",
      warnings: [],
      snapshotBase64: "c25hcHNob3Q=",
    },
    { ok: false, name: "Example site", error: "Write failed", snapshotBase64: "" },
  ],
};

function emptySchemaPaths(value: unknown, path = "$", found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => emptySchemaPaths(entry, `${path}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) found.push(path);
  for (const [key, entry] of entries) emptySchemaPaths(entry, `${path}.${key}`, found);
  return found;
}

describe("content/design/settings tool output contracts", () => {
  it("covers every assigned tool with a concrete OpenAPI output schema", () => {
    expect(Object.keys(representativeOutputs)).toHaveLength(40);

    for (const name of Object.keys(representativeOutputs)) {
      const tool = getTool(name);
      expect(tool, name).toBeDefined();
      expect(tool?.output, name).toBeDefined();

      const jsonSchema = zodOutputJsonSchema(tool?.output);
      expect(jsonSchema, name).not.toEqual({});
      expect(jsonSchema, name).not.toBe(true);
      expect(
        "type" in jsonSchema || "anyOf" in jsonSchema || "oneOf" in jsonSchema,
        `${name} must not fall back to a generic JSON value`,
      ).toBe(true);
      expect(jsonSchema.additionalProperties, `${name} root must not be open-ended`).not.toBe(true);

      const emptyPaths = emptySchemaPaths(jsonSchema);
      const unexpectedEmptyPaths = emptyPaths.filter(
        (path) =>
          !(
            (name === "pages.get_layout" || name === "composition.export") &&
            path.includes(".props.additionalProperties")
          ),
      );
      expect(
        unexpectedEmptyPaths,
        `${name} must not contain generic JSON except governed, section-specific props`,
      ).toEqual([]);
    }
  });

  it("accepts representative JSON-serialized results for every tool and result union", () => {
    for (const [name, samples] of Object.entries(representativeOutputs)) {
      const output = getTool(name)?.output;
      expect(output, name).toBeDefined();
      for (const sample of samples) {
        const serialized = JSON.parse(JSON.stringify(sample)) as unknown;
        const parsed = output?.safeParse(serialized);
        expect(parsed?.success, `${name}: ${parsed?.error?.message ?? "missing output schema"}`).toBe(true);
      }
    }
  });

  it("parses representative real read-handler results after JSON serialization", async () => {
    dbMocks.page.findMany.mockResolvedValueOnce([
      { id: "page_1", slug: "about", title: "About", status: "published", updatedAt: new Date(ISO) },
    ]);
    dbMocks.shippingSettings.findUnique.mockResolvedValueOnce({
      id: 1,
      shippingFeeOere: 4_900,
      freeShippingThresholdOere: 49_900,
      updatedAt: new Date(ISO),
    });
    dbMocks.brandingSettings.findUnique.mockResolvedValueOnce(null);

    const calls: [string, unknown][] = [
      ["pages.list", {}],
      ["settings.get", { type: "shipping" }],
      ["three.get", {}],
    ];
    for (const [name, args] of calls) {
      const tool = getTool(name);
      expect(tool?.output, name).toBeDefined();
      const result = await tool?.handler(args, { actor: "system:test" });
      const serialized = JSON.parse(JSON.stringify(result)) as unknown;
      const parsed = tool?.output?.safeParse(serialized);
      expect(parsed?.success, `${name}: ${parsed?.success === false ? parsed.error.message : "missing output schema"}`).toBe(true);
    }
  });
});
