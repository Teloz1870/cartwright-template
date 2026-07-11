import { describe, expect, it } from "vitest";

import {
  sanitizeContentRow,
  sanitizePageRow,
  sanitizeLayoutJson,
  parseSitePackContent,
} from "@/lib/sitepack/import-parse";
import { toNdjson } from "@/lib/sitepack/serialize";
import { assembleCartpack, type GatheredSite, type ExportMeta } from "@/lib/sitepack/export";
import { openCartpack } from "@/lib/sitepack/import-open";

/**
 * SitePack import — the CONTENT-SAFETY layer. `openCartpack` proves a pack is
 * UNTAMPERED; this layer proves its CONTENT is SAFE to persist. A signature
 * proves WHO authored a pack, not that its HTML is benign — so every vibeHtml
 * (top-level + nested per-locale) and every vibe-section `html` inside a
 * `Page.layoutJson` is forced through the strict DOMPurify sanitizer regardless.
 *
 * The regression these tests pin: `BrandingSettings.layoutJson` is a DIFFERENT
 * schema (global section ORDER, no HTML sink) — it must NOT be run through the
 * page-layout sanitizer, which would reject it and silently wipe the homepage
 * layout on every import.
 */

const HOSTILE = '<section><h2>Hi</h2><script>alert(1)</script><img src=x onerror="steal()"></section>';

/** A valid Page.layoutJson with one vibe section carrying `html`. */
const pageLayout = (html: string) =>
  JSON.stringify({ sections: [{ id: "s1", key: "vibe", enabled: true, props: { html } }] });

/** A BrandingSettings.layoutJson — the OTHER schema: keys + enabled, no HTML. */
const brandingLayout = JSON.stringify({ sections: [{ key: "hero", enabled: true }] });

const clean = (s: unknown) => {
  expect(typeof s).toBe("string");
  return s as string;
};

describe("sanitizeContentRow — vibeHtml (incl. nested translations)", () => {
  it("strips script/onerror from top-level vibeHtml, keeps safe content", () => {
    const html = clean(sanitizeContentRow({ slug: "p", vibeHtml: HOSTILE }).vibeHtml);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/alert\(1\)/);
    expect(html).toMatch(/Hi/);
  });

  it("strips script from nested translations.<locale>.vibeHtml", () => {
    const out = sanitizeContentRow({
      slug: "p",
      translations: { en: { vibeHtml: HOSTILE }, de: { vibeHtml: "<p>ok</p>" } },
    });
    const tr = out.translations as Record<string, { vibeHtml: string }>;
    expect(tr.en.vibeHtml).not.toMatch(/<script/i);
    expect(tr.en.vibeHtml).not.toMatch(/onerror/i);
    expect(tr.de.vibeHtml).toMatch(/ok/);
  });

  it("leaves non-HTML fields and a non-page layoutJson UNTOUCHED", () => {
    const out = sanitizeContentRow({ storeName: "Aluzaun", layoutJson: brandingLayout });
    expect(out.storeName).toBe("Aluzaun");
    expect(out.layoutJson).toBe(brandingLayout); // never run through the page-layout sanitizer
  });

  it("does NOT sanitize body/description/caption (escaped at render, not HTML sinks)", () => {
    // Sanitizing these would corrupt legit markdown / alt text. They are rendered
    // as escaped React text (renderContentBlocks) — never dangerouslySetInnerHTML.
    const body = "Width < 2m & **bold** <not-html>";
    const out = sanitizeContentRow({ body, description: body, caption: body });
    expect(out.body).toBe(body);
    expect(out.description).toBe(body);
    expect(out.caption).toBe(body);
  });

  it("is prototype-pollution safe (drops __proto__/constructor in untrusted JSON)", () => {
    // JSON.parse makes __proto__ an OWN enumerable key; a naive out[k]=v rebuild
    // would hit the __proto__ setter. Assert no global pollution + key dropped.
    const evil = JSON.parse('{"vibeHtml":"<p>ok</p>","__proto__":{"polluted":true},"constructor":{"x":1}}');
    const out = sanitizeContentRow(evil as Record<string, unknown>);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // Object.prototype intact
    expect(Object.prototype.hasOwnProperty.call(out, "__proto__")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "constructor")).toBe(false);
    expect(out.vibeHtml).toMatch(/ok/);
  });

  it("leaves a non-string (object-valued) vibeHtml untouched rather than crashing", () => {
    const out = sanitizeContentRow({ vibeHtml: { not: "a string" } });
    expect(out.vibeHtml).toEqual({ not: "a string" });
  });

  it("throws a CONTROLLED error on pathologically deep nesting (no stack overflow)", () => {
    let deep: unknown = { vibeHtml: "<p>ok</p>" };
    for (let i = 0; i < 500; i++) deep = { nested: deep };
    expect(() => sanitizeContentRow(deep as Record<string, unknown>)).toThrow(/nesting|depth/i);
  });
});

describe("sanitizeLayoutJson — Page.layoutJson (the vibe-section html sink)", () => {
  it("sanitizes the vibe section html and keeps the layout schema-valid", () => {
    const cleaned = clean(sanitizeLayoutJson(pageLayout(HOSTILE)));
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).not.toMatch(/onerror/i);
    expect(cleaned).toMatch(/Hi/);
    const reparsed = JSON.parse(cleaned) as { sections: { key: string; props: { html: string } }[] };
    expect(reparsed.sections[0].key).toBe("vibe");
    expect(reparsed.sections[0].props.html).not.toMatch(/<script/i);
  });

  it("returns null for absent / empty / non-JSON / invalid input", () => {
    expect(sanitizeLayoutJson(null)).toBeNull();
    expect(sanitizeLayoutJson(undefined)).toBeNull();
    expect(sanitizeLayoutJson("")).toBeNull();
    expect(sanitizeLayoutJson("{not json")).toBeNull();
    expect(sanitizeLayoutJson(JSON.stringify({ sections: [] }))).toBeNull(); // min(1)
    expect(sanitizeLayoutJson(JSON.stringify({ sections: [{ id: "s1", key: "NOPE", enabled: true }] }))).toBeNull();
  });

  it("drops a layout whose vibe html is entirely unsafe (emptied → fails re-validation)", () => {
    expect(sanitizeLayoutJson(pageLayout("<script>alert(1)</script>"))).toBeNull();
  });

  it("sanitizes EVERY vibe section when a layout has more than one", () => {
    const twoVibes = JSON.stringify({
      sections: [
        { id: "a", key: "vibe", enabled: true, props: { html: '<p>one</p><script>a()</script>' } },
        { id: "b", key: "vibe", enabled: true, props: { html: '<p>two</p><img src=x onerror="b()">' } },
      ],
    });
    const cleaned = clean(sanitizeLayoutJson(twoVibes));
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).not.toMatch(/onerror/i);
    expect(cleaned).toMatch(/one/);
    expect(cleaned).toMatch(/two/);
  });
});

describe("sanitizePageRow — vibeHtml + Page.layoutJson together", () => {
  it("sanitizes both the vibeHtml field and the layoutJson html sink", () => {
    const out = sanitizePageRow({ slug: "home", vibeHtml: HOSTILE, layoutJson: pageLayout(HOSTILE) });
    expect(clean(out.vibeHtml)).not.toMatch(/<script/i);
    const layout = clean(out.layoutJson);
    expect(layout).not.toMatch(/<script/i);
    expect(layout).not.toMatch(/onerror/i);
  });

  it("nulls an invalid layoutJson on a page row (body fallback)", () => {
    const out = sanitizePageRow({ slug: "home", layoutJson: "{not json" });
    expect(out.layoutJson).toBeNull();
  });
});

describe("parseSitePackContent — sanitizes the right collections, passes the rest", () => {
  function entries(): Map<string, Buffer> {
    const m = new Map<string, Buffer>();
    m.set(
      "content/pages.ndjson",
      Buffer.from(
        toNdjson([{ slug: "home", vibeHtml: HOSTILE, layoutJson: pageLayout(HOSTILE), translations: { en: { vibeHtml: HOSTILE } } }]),
        "utf8",
      ),
    );
    m.set("content/categories.ndjson", Buffer.from(toNdjson([{ slug: "fences", vibeHtml: HOSTILE }]), "utf8"));
    m.set("content/services.ndjson", Buffer.from(toNdjson([{ slug: "install", vibeHtml: HOSTILE }]), "utf8"));
    m.set("content/posts.ndjson", Buffer.from(toNdjson([{ slug: "news", vibeHtml: HOSTILE }]), "utf8"));
    m.set("content/products.ndjson", Buffer.from(toNdjson([{ slug: "gate", vibeHtml: HOSTILE }]), "utf8"));
    m.set("content/product-variants.ndjson", Buffer.from(toNdjson([{ productSlug: "p", sku: "v1", attributes: { size: "L" } }]), "utf8"));
    m.set("content/product-media.ndjson", Buffer.from(toNdjson([{ productSlug: "p", assetSha256: "abc", position: 0 }]), "utf8"));
    m.set("media/manifest.ndjson", Buffer.from(toNdjson([{ sha256: "abc", mime: "image/webp" }]), "utf8"));
    m.set("content/branding.json", Buffer.from(JSON.stringify({ storeName: "Aluzaun", vibeHtml: HOSTILE, layoutJson: brandingLayout }), "utf8"));
    m.set("content/integrations.stub.json", Buffer.from(JSON.stringify({ aiProvider: "anthropic" }), "utf8"));
    return m;
  }

  it("sanitizes vibeHtml in EVERY content collection (pages, categories, services, posts, products, branding)", () => {
    const c = parseSitePackContent(entries());
    const page = c.pages[0];
    expect(clean(page.vibeHtml)).not.toMatch(/<script/i);
    expect((page.translations as { en: { vibeHtml: string } }).en.vibeHtml).not.toMatch(/<script/i);
    expect(clean(page.layoutJson)).not.toMatch(/<script/i);
    expect(clean(c.categories[0].vibeHtml)).not.toMatch(/<script/i);
    expect(clean(c.services[0].vibeHtml)).not.toMatch(/<script/i);
    expect(clean(c.posts[0].vibeHtml)).not.toMatch(/<script/i);
    expect(clean(c.products[0].vibeHtml)).not.toMatch(/<script/i);
    expect(clean(c.branding!.vibeHtml)).not.toMatch(/<script/i);
  });

  it("drops a non-object NDJSON row (primitive/array) without crashing", () => {
    const m = new Map<string, Buffer>();
    // A valid row, then a hostile primitive line and an array line.
    m.set("content/pages.ndjson", Buffer.from('{"slug":"ok","vibeHtml":"<p>fine</p>"}\n"evil"\n[1,2,3]\n', "utf8"));
    const c = parseSitePackContent(m);
    expect(c.pages).toHaveLength(1);
    expect(c.pages[0].slug).toBe("ok");
  });

  it("returns null branding when branding.json is a non-object (array)", () => {
    const m = new Map<string, Buffer>();
    m.set("content/branding.json", Buffer.from("[1,2,3]", "utf8"));
    expect(parseSitePackContent(m).branding).toBeNull();
  });

  it("passes joins/metadata through untouched and PRESERVES branding's layoutJson", () => {
    const c = parseSitePackContent(entries());
    expect(c.variants[0].sku).toBe("v1");
    expect(c.productMedia[0].assetSha256).toBe("abc");
    expect(c.media[0].sha256).toBe("abc");
    expect(c.branding!.storeName).toBe("Aluzaun");
    // The regression guard: branding's global section-order layout must survive
    // verbatim — it is a different schema and was being wrongly dropped.
    expect(c.branding!.layoutJson).toBe(brandingLayout);
    expect(c.integration!.aiProvider).toBe("anthropic");
  });

  it("treats a missing collection as empty / null", () => {
    const c = parseSitePackContent(new Map());
    expect(c.pages).toEqual([]);
    expect(c.products).toEqual([]);
    expect(c.branding).toBeNull();
    expect(c.integration).toBeNull();
  });
});

describe("parseSitePackContent — end-to-end through openCartpack", () => {
  it("a consistent pack carrying hostile vibeHtml clears integrity, then is sanitized on parse", () => {
    const g: GatheredSite = {
      pages: [
        {
          row: { slug: "home", title: "Home", body: "x", status: "published", vibeHtml: HOSTILE, layoutJson: pageLayout(HOSTILE) },
          heroImageSha256: null,
        },
      ],
      categories: [],
      services: [],
      posts: [],
      products: [],
      variants: [],
      productMedia: [],
      media: [],
      branding: { storeName: "Aluzaun" },
      integration: { aiProvider: "anthropic" },
      compositionJson: JSON.stringify({ schema: "cartwright-composition-v1", name: "Aluzaun", skin: "aurora-shop" }),
    };
    const meta: ExportMeta = {
      id: "01J8ABCDEF",
      name: "Aluzaun",
      createdAt: "2026-06-14T00:00:00Z",
      exporter: { version: "0.0.0-source", channel: "source", ref: "source" } as ExportMeta["exporter"],
      mode: "webshop",
      defaultLocale: "da",
      locales: ["da", "en"],
      designRef: { slug: "aurora-shop", kind: "data" },
    };
    const opened = openCartpack(assembleCartpack(g, meta), { maxTotalBytes: 10_000_000, maxEntries: 1000, maxEntryBytes: 5_000_000 });
    const content = parseSitePackContent(opened.entries);
    expect(clean(content.pages[0].vibeHtml)).not.toMatch(/<script/i);
    expect(clean(content.pages[0].layoutJson)).not.toMatch(/<script/i);
  });
});
